import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import ConfirmationModal from '../components/ConfirmationModal';
import type { AlertButton } from '../components/ConfirmationModal';

// ── Types ──

interface AlertConfig {
  title: string;
  message: string;
  buttons: AlertButton[];
  icon?: string;
  iconColor?: string;
}

interface PlatformAlertContextValue {
  /**
   * Platform-aware replacement for Alert.alert().
   * On native: delegates to Alert.alert (works with button arrays).
   * On web: shows a custom ConfirmationModal.
   *
   * @param title   - Alert title
   * @param message - Alert message body
   * @param buttons - Array of buttons (optional). If omitted, shows a single "OK" button.
   * @param options - Optional icon/iconColor overrides for the web modal.
   */
  platformAlert: (
    title: string,
    message: string,
    buttons?: AlertButton[],
    options?: { icon?: string; iconColor?: string },
  ) => void;
}

const PlatformAlertContext = createContext<PlatformAlertContextValue>({
  platformAlert: () => {},
});

// ── Provider ──

export function PlatformAlertProvider({ children }: { children: React.ReactNode }) {
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);
  const queueRef = useRef<AlertConfig[]>([]);
  const showingRef = useRef(false);

  const showNext = useCallback(() => {
    if (queueRef.current.length === 0) {
      showingRef.current = false;
      return;
    }
    showingRef.current = true;
    const next = queueRef.current.shift()!;
    setAlertConfig(next);
  }, []);

  const dismiss = useCallback(() => {
    setAlertConfig(null);
    // Show next queued alert after a brief delay
    setTimeout(() => showNext(), 100);
  }, [showNext]);

  const platformAlert = useCallback((
    title: string,
    message: string,
    buttons?: AlertButton[],
    options?: { icon?: string; iconColor?: string },
  ) => {
    const resolvedButtons = buttons && buttons.length > 0
      ? buttons
      : [{ text: 'OK', style: 'default' as const }];

    // On native platforms, use the built-in Alert.alert (it works with button arrays)
    if (Platform.OS !== 'web') {
      Alert.alert(
        title,
        message,
        resolvedButtons.map(b => ({
          text: b.text,
          style: b.style,
          onPress: b.onPress,
        })),
      );
      return;
    }

    // On web: check if buttons array is simple (no buttons or just OK with no onPress)
    const isSimple = resolvedButtons.length === 1
      && (resolvedButtons[0].text === 'OK' || resolvedButtons[0].text === 'Ok')
      && !resolvedButtons[0].onPress;

    if (isSimple) {
      // Use window.alert for simple informational alerts on web
      window.alert(`${title}\n\n${message}`);
      return;
    }

    // For complex alerts with multiple buttons or callbacks, use the custom modal
    // Wrap button onPress handlers to auto-dismiss the modal
    const wrappedButtons: AlertButton[] = resolvedButtons.map(b => ({
      ...b,
      onPress: () => {
        dismiss();
        if (b.onPress) {
          // Small delay to let modal close animation start
          setTimeout(() => b.onPress!(), 50);
        }
      },
    }));

    const config: AlertConfig = {
      title,
      message,
      buttons: wrappedButtons,
      icon: options?.icon,
      iconColor: options?.iconColor,
    };

    if (showingRef.current) {
      // Queue if another alert is showing
      queueRef.current.push(config);
    } else {
      showingRef.current = true;
      setAlertConfig(config);
    }
  }, [dismiss]);

  return (
    <PlatformAlertContext.Provider value={{ platformAlert }}>
      {children}
      {alertConfig && (
        <ConfirmationModal
          visible={true}
          title={alertConfig.title}
          message={alertConfig.message}
          buttons={alertConfig.buttons}
          onDismiss={dismiss}
          icon={alertConfig.icon}
          iconColor={alertConfig.iconColor}
        />
      )}
    </PlatformAlertContext.Provider>
  );
}

// ── Hook ──

export function usePlatformAlert() {
  return useContext(PlatformAlertContext);
}
