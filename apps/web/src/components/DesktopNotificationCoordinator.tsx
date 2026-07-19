import { useEffect } from "react";
import {
  getDesktopNotificationState,
  startDesktopNotificationStream,
  subscribeDesktopNotificationState,
} from "../services/desktopNotificationService";

export function DesktopNotificationCoordinator() {
  useEffect(() => {
    let stop: () => void = () => undefined;
    let disposed = false;
    let wasEnabled = getDesktopNotificationState().enabled;

    const restart = () => {
      stop();
      stop = () => undefined;
      if (!getDesktopNotificationState().enabled) return;
      void startDesktopNotificationStream().then((nextStop) => {
        if (disposed || !getDesktopNotificationState().enabled) nextStop();
        else stop = nextStop;
      });
    };

    restart();
    const unsubscribe = subscribeDesktopNotificationState((state) => {
      if (state.enabled && !wasEnabled) restart();
      if (!state.enabled && wasEnabled) stop();
      wasEnabled = state.enabled;
    });
    return () => {
      disposed = true;
      unsubscribe();
      stop();
    };
  }, []);

  return null;
}
