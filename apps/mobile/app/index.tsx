import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";
import { getMyRole, routeForRole } from "../lib/auth";
import {
  isBiometricAvailable,
  isBiometricEnabled,
  setBiometricEnabled,
  authenticateWithBiometrics,
} from "../lib/biometrics";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // Estado "verificando": mientras chequeamos si hay sesión persistida, NO mostramos
  // el formulario para que no parpadee cuando el auto-login va a entrar directo.
  const [checking, setChecking] = useState(true);
  // Estado "bloqueado": hay sesión + biometría activada → pantalla de desbloqueo con
  // huella en vez del auto-login directo. `pendingDest` es el destino al desbloquear.
  const [locked, setLocked] = useState(false);
  const [pendingDest, setPendingDest] = useState<string | null>(null);
  // Solo true cuando se cae al login DESDE el fallback de huella (email ya precargado):
  // ahí enfocamos la contraseña. En un login fresco queda false (no abrir teclado).
  const [focusPassword, setFocusPassword] = useState(false);

  // Lanza el prompt de huella. Éxito → entra. Falla/cancela → queda en la pantalla de
  // desbloqueo con los botones "Reintentar" / "Usar contraseña" (no traba al usuario).
  async function runBiometricGate(dest: string) {
    const ok = await authenticateWithBiometrics();
    if (ok) router.replace(dest);
  }

  // Auto-login al arrancar: si hay sesión válida guardada (AsyncStorage), enrutar
  // por rol sin pedir credenciales. Los guards de cada zona (_layout) siguen vigentes.
  useEffect(() => {
    let active = true;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        if (active) setChecking(false);
        return;
      }
      const role = await getMyRole();
      const dest = routeForRole(role);
      if (!active) return;
      if (!dest) {
        // Sesión válida pero sin sección asignada: cerrar y mostrar el login.
        await supabase.auth.signOut();
        if (active) setChecking(false);
        return;
      }
      // Gate de huella: solo si el usuario lo activó Y el dispositivo puede usarlo.
      // Si falta cualquiera, comportamiento de Fase 1 (auto-login directo).
      const enabled = await isBiometricEnabled();
      const available = enabled && (await isBiometricAvailable());
      if (!active) return;
      if (enabled && available) {
        setPendingDest(dest);
        // Precargar el email desde la sesión: si caen al fallback de contraseña
        // ("Usar contraseña"), solo tienen que tipear la clave, no el email.
        setEmail(session.user.email ?? "");
        setChecking(false);
        setLocked(true);
        runBiometricGate(dest); // dispara el prompt apenas abre la app
        return;
      }
      router.replace(dest);
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert("Error", "Ingresá email y contraseña");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      Alert.alert("Error", error.message);
      return;
    }

    // Enrutar según el rol: operario -> medidores; tesorera/super_admin -> su zona.
    const role = await getMyRole();
    const dest = routeForRole(role);
    setLoading(false);
    if (!dest) {
      await supabase.auth.signOut();
      Alert.alert("Sin acceso", "Tu usuario no tiene una sección asignada en la app.");
      return;
    }
    // Opt-in: tras un login con contraseña exitoso, ofrecer activar la huella si el
    // dispositivo puede y todavía no está activada. Se enruta igual elija lo que elija.
    await offerBiometricActivation();
    router.replace(dest);
  }

  // Ofrece activar el ingreso con huella. Resuelve cuando el usuario responde (o de una
  // si el dispositivo no puede o ya está activada). No bloquea el ingreso.
  async function offerBiometricActivation(): Promise<void> {
    const available = await isBiometricAvailable();
    const enabled = await isBiometricEnabled();
    if (!available || enabled) return;
    await new Promise<void>((resolve) => {
      Alert.alert(
        "Ingreso con huella",
        "¿Querés activar el ingreso con tu huella?",
        [
          { text: "Ahora no", style: "cancel", onPress: () => resolve() },
          {
            text: "Activar",
            onPress: async () => {
              // Confirmar con la huella ANTES de activar: feedback inmediato de que
              // funciona y no activamos un candado que el usuario no puede pasar.
              const ok = await authenticateWithBiometrics();
              if (ok) {
                await setBiometricEnabled(true);
              }
              resolve();
            },
          },
        ],
        { cancelable: false }
      );
    });
  }

  // Pantalla neutra mientras se resuelve el auto-login (evita el flash del form).
  if (checking) {
    return (
      <View style={[styles.container, styles.checking]}>
        <ActivityIndicator size="large" color="#1a73e8" />
      </View>
    );
  }

  // Pantalla de desbloqueo: hay sesión persistida + huella activada. Reintentar la
  // huella o caer al login con contraseña (fallback, sin trabar).
  if (locked) {
    return (
      <View style={[styles.container, styles.checking]}>
        <Text style={styles.title}>Acueducto</Text>
        <Text style={styles.subtitle}>Ingresá con tu huella</Text>
        <TouchableOpacity
          style={[styles.button, styles.unlockButton]}
          onPress={() => pendingDest && runBiometricGate(pendingDest)}
        >
          <Text style={styles.buttonText}>Usar huella</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setFocusPassword(true);
            setLocked(false);
          }}
        >
          <Text style={styles.linkText}>Usar contraseña</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Acueducto</Text>
        <Text style={styles.subtitle}>Lecturas de campo</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholderTextColor="#999"
        />
        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholderTextColor="#999"
          autoFocus={focusPassword}
        />
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Ingresando..." : "Ingresar"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  checking: { justifyContent: "center", alignItems: "center" },
  inner: { flex: 1, justifyContent: "center", padding: 24 },
  title: { fontSize: 32, fontWeight: "bold", textAlign: "center", color: "#1a73e8", marginBottom: 4 },
  subtitle: { fontSize: 16, textAlign: "center", color: "#666", marginBottom: 40 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
    color: "#333",
  },
  button: {
    backgroundColor: "#1a73e8",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  unlockButton: { marginTop: 24, paddingHorizontal: 48 },
  linkText: { color: "#1a73e8", fontSize: 15, fontWeight: "600", marginTop: 16 },
});
