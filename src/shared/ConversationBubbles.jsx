/**
 * Renderiza mensajes entre sucursal y bodega como burbujas de chat cronológicas:
 * mensajes del otro usuario a la izquierda y mensajes del usuario actual a la derecha,
 * conservando la etiqueta del remitente (ej. Dragustin, Piso).
 */

import React from 'react';
import { userService } from '../modules/usuarios/userService';

function norm(val) {
  return String(val || '').trim().toLowerCase();
}

function isMessageMine(msg, { currentUser, solicitud, viewerSide = 'auto' } = {}) {
  if (!msg) return false;
  const user = currentUser || userService.getCurrentUser();

  if (user && msg.author) {
    const authorNorm = norm(msg.author);
    if (
      (user.username && norm(user.username) === authorNorm) ||
      (user.nombre && norm(user.nombre) === authorNorm)
    ) {
      return true;
    }
  }

  if (viewerSide === 'receptor') return msg.roleSide === 'receptor';
  if (viewerSide === 'bodega') return msg.roleSide === 'bodega';

  if (user && solicitud) {
    const userSede = norm(user.sede);
    const userArea = norm(user.area);
    const isDirect = Boolean(solicitud.sinSolicitud || solicitud.esDespachoDirecto);

    const receptorSede = norm(
      isDirect ? (solicitud.sucursalReceptora || solicitud.sucursalDestino) : solicitud.sucursalOrigen
    );
    const bodegaSede = norm(
      isDirect ? solicitud.sucursalOrigen : solicitud.sucursalDestino
    );

    const receptorArea = norm(isDirect ? solicitud.areaDestino : solicitud.areaOrigen);
    const bodegaArea = norm(isDirect ? solicitud.areaOrigen : solicitud.areaDestino);

    const matchesReceptor = Boolean(userSede && receptorSede === userSede) &&
      (!receptorArea || !userArea || receptorSede !== bodegaSede || receptorArea === userArea);
    const matchesBodega = Boolean(userSede && bodegaSede === userSede) &&
      (!bodegaArea || !userArea || receptorSede !== bodegaSede || bodegaArea === userArea);

    if (matchesReceptor && !matchesBodega) return msg.roleSide === 'receptor';
    if (matchesBodega && !matchesReceptor) return msg.roleSide === 'bodega';
  }

  return false;
}

function extractOrderConversationMessages(solicitud, options = {}) {
  if (!solicitud) return [];
  const {
    includeItemReportFallback = false,
    includeDirectDispatchFallback = false
  } = options;

  const isDirect = Boolean(solicitud.sinSolicitud || solicitud.esDespachoDirecto);

  const receptorAuthor =
    solicitud.reporteDiscrepancias?.usuarioReceptor ||
    solicitud.usuarioReceptor ||
    (isDirect ? (solicitud.sucursalReceptora || solicitud.sucursalDestino) : solicitud.sucursalOrigen) ||
    'Sucursal';

  const bodegaAuthor =
    solicitud.resolucionFaltantes?.usuarioResolucion ||
    solicitud.usuarioDespacho ||
    (isDirect ? solicitud.sucursalOrigen : solicitud.sucursalDestino) ||
    'Bodega';

  const finalReceptorAuthor =
    solicitud.recepcionFaltantes?.usuarioRecepcion ||
    receptorAuthor;

  const rawReportText =
    solicitud.reporteDiscrepancias?.observaciones ||
    solicitud.observacionesRecepcion ||
    (includeItemReportFallback
      ? solicitud.reporteFaltantes?.map(rf => rf.observacion || rf.motivo).filter(Boolean).join('; ')
      : '');
  const reportText = typeof rawReportText === 'string' ? rawReportText.trim() : '';

  const rawDirectObs = isDirect ? (solicitud.observaciones || solicitud.motivo || solicitud.notas) : '';
  const directObs = typeof rawDirectObs === 'string' ? rawDirectObs.trim() : '';
  const isGenericDirect =
    !directObs ||
    directObs === 'Pedido despachado sin haber sido solicitado' ||
    directObs === 'Pedido despachado sin haber sido solicitado.';

  const rawReplyText =
    solicitud.resolucionFaltantes?.notas ||
    (includeDirectDispatchFallback && isDirect && !isGenericDirect ? directObs : '');
  const replyText = typeof rawReplyText === 'string' ? rawReplyText.trim() : '';

  const rawClosureText = solicitud.recepcionFaltantes?.notas;
  const closureText = typeof rawClosureText === 'string' ? rawClosureText.trim() : '';

  const list = [];
  if (reportText) {
    list.push({
      id: 'branch-report',
      roleSide: 'receptor',
      author: receptorAuthor,
      text: reportText
    });
  }
  if (replyText) {
    list.push({
      id: 'bodega-reply',
      roleSide: 'bodega',
      author: bodegaAuthor,
      text: replyText
    });
  }
  if (closureText) {
    list.push({
      id: 'branch-closure',
      roleSide: 'receptor',
      author: finalReceptorAuthor,
      text: closureText
    });
  }

  return list;
}

export function ConversationBubbles({
  messages,
  solicitud,
  currentUser,
  viewerSide = 'auto',
  includeItemReportFallback = false,
  includeDirectDispatchFallback = false,
  compact = false,
  className = ''
}) {
  const activeUser = currentUser || userService.getCurrentUser();
  const resolvedMessages = (
    Array.isArray(messages)
      ? messages
      : extractOrderConversationMessages(solicitud, {
          includeItemReportFallback,
          includeDirectDispatchFallback
        })
  ).filter(m => m && typeof m.text === 'string' ? m.text.trim().length > 0 : Boolean(m?.text));

  if (resolvedMessages.length === 0) return null;

  return (
    <div
      className={`${compact ? 'space-y-2' : 'space-y-2.5'} ${className}`.trim()}
    >
      <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 text-left">
        Conversación:
      </p>
      <div className={compact ? 'space-y-2' : 'space-y-2.5'}>
        {resolvedMessages.map((msg, idx) => {
          const isMine = isMessageMine(msg, { currentUser: activeUser, solicitud, viewerSide });
          return (
            <div
              key={msg.id || idx}
              className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
            >
              {msg.author && (
                <span className="chat-author-tag text-[10px] font-semibold px-2 py-0.5 rounded-full mb-1 shadow-2xs">
                  {msg.author}
                </span>
              )}
              <div
                className={`max-w-[88%] px-3.5 py-2 text-xs font-medium leading-relaxed break-words whitespace-pre-line shadow-2xs rounded-2xl ${
                  isMine ? 'chat-bubble-mine rounded-tr-sm' : 'chat-bubble-other rounded-tl-sm'
                }`}
              >
                {String(msg.text).trim()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
