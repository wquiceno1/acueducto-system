import { Platform, ToastAndroid, Alert } from "react-native";

// Feedback de éxito NO bloqueante. En Android usa Toast (no interrumpe);
// en iOS cae a un Alert simple.
export function toast(mensaje: string) {
  if (Platform.OS === "android") {
    ToastAndroid.show(mensaje, ToastAndroid.SHORT);
  } else {
    Alert.alert(mensaje);
  }
}

// Traduce errores comunes de Supabase/Postgres a mensajes entendibles por la
// tesorera, en vez de mostrar el error crudo de la base.
export function mensajeError(error: { code?: string; message: string }): string {
  switch (error.code) {
    case "23505": // unique_violation
      if (error.message.includes("numero_serie")) {
        return "Ya existe un medidor con ese número de serie.";
      }
      return "Ya existe un registro con esos datos (valor duplicado).";
    case "23503": // foreign_key_violation
      return "No se puede completar la operación porque hay datos relacionados.";
    default:
      return error.message;
  }
}

// Validación básica de email (para campos opcionales: solo se valida si hay texto).
export function emailValido(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
