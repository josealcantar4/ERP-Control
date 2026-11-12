/**
 * Punto central de exportación de componentes reutilizables, modales y utilidades de la interfaz compartida.
 */

export { AppleNavbar } from './AppleNavbar';
export { DashboardScreen } from './DashboardScreen';
export { ModalDialog } from './ModalDialog';
export { BarcodeScannerModal } from './BarcodeScannerModal';
export { CaptureQuantityModal } from './CaptureQuantityModal';
export { OfflineIndicator } from './OfflineIndicator';
export { PWAInstallPrompt } from './PWAInstallPrompt';
export { ReloadPrompt } from './ReloadPrompt';
export { ErrorBoundary } from './ErrorBoundary';
export { ScreenRefreshSpinner } from './ScreenRefreshSpinner';
export { LogoutLoadingScreen } from './LogoutLoadingScreen';
export { NotificationsModal } from './NotificationsModal';
export { AutoScrollInput } from './AutoScrollInput';
export { MarqueeText } from './MarqueeText';
export { transitionView } from './viewTransition';
export { QuantityStepper } from './QuantityStepper';
export { DiscrepancySummaryModal } from './DiscrepancySummaryModal';
export { FloatingInput } from './FloatingInput';
export { MarqueeSearchInput } from './MarqueeSearchInput';
export { AppSidebar } from './AppSidebar';
export { AboutModal } from './AboutModal';
export { themeService } from './themeService';
export { soundSettingsService } from './soundSettingsService';
export { userPreferencesService } from './userPreferencesService';
export { playCheckSound, playNotificationSound, playOrderSuccessSound, playSuccessSound } from '../modules/transferencias';
export { DEFAULT_FRIENDLY_ERROR_MESSAGE, isTechnicalError, parseErrorDisplay } from './errorUtils';
