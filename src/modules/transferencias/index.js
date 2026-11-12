/**
 * Punto central de exportación para utilidades, permisos y servicios de gestión de transferencias entre sedes.
 */

export {
  transferService,
  formatTransferFolio,
  playNotificationSound,
  playCheckSound,
  playOrderSuccessSound,
  playSuccessSound,
  unlockAudioEngine,
  dismissNotification,
  undismissNotification,
  getDismissedNotifications,
  canUserViewInSolicitar,
  canUserDispatch,
  canUserReceive,
  canUserViewInRecibirHistory,
  getTransferParticipants,
  formatOrderRequestedBy,
  isAreaExcludedFromTransfers,
  isDirectDispatch
} from './transferService';
export { TransferDetailModal } from './TransferDetailModal';
