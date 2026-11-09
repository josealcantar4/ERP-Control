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
  getTransferParticipants,
  isAreaExcludedFromTransfers
} from './transferService';
export { TransferDetailModal } from './TransferDetailModal';
