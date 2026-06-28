import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";

// Candado LOCAL sobre la sesión ya persistida: la huella NO autentica contra Supabase,
// solo desbloquea el acceso a la app. Toda la lógica de biometría vive acá para no
// desparramarla por las pantallas.

const FLAG_KEY = "biometria_on";

// ¿El dispositivo puede usar biometría? Necesita hardware Y al menos una huella enrolada.
// Si falta cualquiera, el caller cae al comportamiento de Fase 1 (auto-login directo).
export async function isBiometricAvailable(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return false;
  return LocalAuthentication.isEnrolledAsync();
}

// ¿El usuario activó el ingreso con huella? (flag opt-in en AsyncStorage)
export async function isBiometricEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(FLAG_KEY)) === "1";
}

// Activar/desactivar el flag. Se desactiva en logout para no dejar el gate apuntando
// a una sesión cerrada.
export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await AsyncStorage.setItem(FLAG_KEY, "1");
  } else {
    await AsyncStorage.removeItem(FLAG_KEY);
  }
}

// Lanza el prompt de huella. Devuelve true solo si autenticó OK. Falla/cancelación → false,
// para que el caller ofrezca el fallback a contraseña sin trabar al usuario.
export async function authenticateWithBiometrics(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Ingresá con tu huella",
    cancelLabel: "Usar contraseña",
    disableDeviceFallback: true,
  });
  return result.success;
}
