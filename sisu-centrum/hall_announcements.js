'use strict';
const crypto = require('node:crypto');

// Handles private, authenticated previews and live hall announcements.
// The Home Assistant bearer token never leaves the server.
module.exports = function hallAnnouncements({haApi, send, requireUser, csrfOk, jsonBody, audit, invalidateOverview, hallAudio, haToken}) {
  const HA_API = 'http://supervisor/core/api';
  const TTS_ENGINE = process.env.SISU_TTS_ENGINE || 'tts.home_assistant_cloud';
  const VOICES = Object.freeze({AgnieszkaNeural:'Agnieszka', MarekNeural:'Marek'});
  const MAX_TEXT = 650;
  const MAX_AUDIO = 5 * 1024 * 1024;
  const PREVIEW_TTL = 10 * 60 * 1000;
  const previews = new Map();

  function httpError(message, status) {
    return Object.assign(new Error(message), {status});
  }

  function cleanup() {
    const now = Date.now();
    for (const [key, value] of previews) if (now - value.at >= PREVIEW_TTL) previews.delete(key);
    if (previews.size >= 100) {
      const oldest = previews.keys().next().value;
      if (oldest) previews.delete(oldest);
    }
  }

  function ttsPayload(text, voice) {
    return {message:text,language:'pl-PL',cache:true,options:{voice,preferred_format:'mp3'}};
  }

  async function generatePreview(text, voice) {
    if (!haToken) throw httpError('Brak połączenia z Home Assistant', 503);
    let response;
    try {
      response = await fetch(HA_API + '/tts_get_url', {
        method:'POST', redirect:'error', signal:AbortSignal.timeout(45000),
        headers:{Authorization:'Bearer ' + haToken, Accept:'application/json', 'Content-Type':'application/json'},
        body:JSON.stringify({engine_id:TTS_ENGINE,...ttsPayload(text,voice)})
      });
    } catch {
      throw httpError('Nie udało się przygotować głosu. Sprawdź połączenie z Home Assistant.', 503);
    }
    if (!response.ok) throw httpError('Syntezator Home Assistant nie przygotował nagrania (HTTP ' + response.status + '). Sprawdź usługę Home Assistant Cloud TTS.', 502);
    const result = await response.json().catch(()=>null);
    const previewPath = result && result.path;
    if (typeof previewPath !== 'string' || !/^\/api\/tts_proxy\/[A-Za-z0-9_.%\-]+$/.test(previewPath)) {
      throw httpError('Home Assistant zwrócił nieprawidłową ścieżkę nagrania.', 502);
    }
    return previewPath;
  }

  async function handle(req, res, p) {
    const isPreview = p === '/api/hall-announcements/preview' && req.method === 'POST';
    const isSend = p === '/api/hall-announcements/send' && req.method === 'POST';
    const isAudio = p.startsWith('/api/hall-announcements/audio/') && req.method === 'GET';
    const isStop = p === '/api/music/stop' && req.method === 'POST';
    if (!(isPreview || isSend || isAudio || isStop)) return false;

    const ctx = requireUser(req, res, ['admin','manager']);
    if (!ctx) return true;
    if (!isAudio && !csrfOk(req, res, ctx)) return true;

    if (isStop) {
      await jsonBody(req);
      await haApi('/services/media_player/media_stop','POST',{entity_id:hallAudio});
      invalidateOverview();
      audit(ctx.user.id,'hall_music_stop',{entity_id:hallAudio});
      send(res,200,{ok:true,accepted:true});
      return true;
    }

    cleanup();
    if (isPreview) {
      const body = await jsonBody(req);
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      const voice = body.voice;
      if (!text || text.length > MAX_TEXT) {
        send(res,400,{error:'Wpisz komunikat o długości od 1 do 650 znaków.'});
        return true;
      }
      if (typeof voice !== 'string' || !Object.prototype.hasOwnProperty.call(VOICES,voice)) {
        send(res,400,{error:'Wybierz dostępny głos polski.'});
        return true;
      }
      const path = await generatePreview(text,voice);
      const id = crypto.randomBytes(24).toString('hex');
      previews.set(id,{userId:ctx.user.id,text,voice,path,at:Date.now()});
      send(res,200,{ok:true,id,expiresInSeconds:PREVIEW_TTL/1000});
      return true;
    }

    const id = isAudio ? p.slice('/api/hall-announcements/audio/'.length) : (await jsonBody(req)).id;
    const preview = typeof id === 'string' && /^[0-9a-f]{48}$/.test(id) ? previews.get(id) : null;
    if (!preview || preview.userId !== ctx.user.id || Date.now()-preview.at >= PREVIEW_TTL) {
      send(res,410,{error:'Odsłuch wygasł. Wygeneruj go ponownie.'});
      return true;
    }

    if (isSend) {
      // Once reviewed in the computer, speak the same text/voice in the real hall.
      await haApi('/services/tts/speak','POST',{
        entity_id:TTS_ENGINE,media_player_entity_id:hallAudio,
        ...ttsPayload(preview.text,preview.voice)
      });
      previews.delete(id); // Prevent accidental replay from a double-click.
      invalidateOverview();
      audit(ctx.user.id,'hall_announcement',{voice:preview.voice,length:preview.text.length});
      send(res,200,{ok:true,accepted:true});
      return true;
    }

    // Preview audio remains private and same-origin. Do not disclose the HA token
    // or the Home Assistant internal TTS media URL to the browser.
    if (!haToken) throw httpError('Brak połączenia z Home Assistant',503);
    let audio;
    try {
      audio = await fetch(HA_API + preview.path, {
        method:'GET',redirect:'error',signal:AbortSignal.timeout(30000),
        headers:{Authorization:'Bearer ' + haToken}
      });
    } catch {
      throw httpError('Nie można pobrać nagrania z Home Assistant.',503);
    }
    if (!audio.ok) throw httpError('Nagranie nie jest już dostępne w Home Assistant.',502);
    const declaredSize = Number(audio.headers.get('content-length') || 0);
    if (declaredSize > MAX_AUDIO) throw httpError('Nagranie jest zbyt duże.',413);
    const bytes = Buffer.from(await audio.arrayBuffer());
    if (bytes.length > MAX_AUDIO) throw httpError('Nagranie jest zbyt duże.',413);
    const mimetype = audio.headers.get('content-type') || '';
    res.statusCode = 200;
    res.setHeader('Content-Type', /^audio\/(?:mpeg|mp3|wav|ogg|x-wav)/i.test(mimetype) ? mimetype : 'audio/mpeg');
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('Content-Length',String(bytes.length));
    res.setHeader('X-Content-Type-Options','nosniff');
    res.end(bytes);
    return true;
  }

  return {handle};
};
