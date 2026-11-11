import { useState } from "react";
import { View, Text, TextInput } from "react-native";
import { router } from "expo-router";
import { Card, Title, Copy, Button, s } from "../components/ui";
import { useWorkspace } from "../components/workspace";
export default function Login() {
  const { login } = useWorkspace();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#f7f8f3",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <Card style={{ width: "100%", maxWidth: 480, alignSelf: "center" }}>
        <Text style={s.logo}>horekia✳</Text>
        <Title>Entra en tu centro.</Title>
        <Copy>
          Usa la cuenta que te ha facilitado tu empresa de catering. Solo verás
          tus centros autorizados.
        </Copy>
        <Text style={s.fieldLabel}>Correo electrónico</Text>
        <TextInput
          accessibilityLabel="Correo electrónico"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          style={s.input}
          editable={!busy}
        />
        <Text style={s.fieldLabel}>Contraseña</Text>
        <TextInput
          accessibilityLabel="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          style={s.input}
          editable={!busy}
        />
        <Text style={s.fieldLabel}>
          Código de autenticador (si lo tienes activado)
        </Text>
        <TextInput
          accessibilityLabel="Código de autenticador"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          style={s.input}
          editable={!busy}
        />
        {error !== "" && (
          <Text role="alert" style={{ fontSize: 13, color: "#aa392d" }}>
            {error}
          </Text>
        )}
        <Button
          label={busy ? "Entrando…" : "Iniciar sesión"}
          disabled={busy || !email || !password}
          onPress={async () => {
            setBusy(true);
            setError("");
            try {
              await login(email, password, code);
              setPassword("");
              setCode("");
              router.replace("/");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
        <Button
          secondary
          label="Volver a la demostración"
          disabled={busy}
          onPress={() => router.replace("/")}
        />
      </Card>
    </View>
  );
}
