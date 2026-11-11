import { useWorkspace } from "../components/workspace";
import { Text } from "react-native";
import { Shell, Label, Title, Copy, Card, s } from "../components/ui";
export default function Profile() {
  const { center, user } = useWorkspace();
  return (
    <Shell>
      <Label>MI CENTRO</Label>
      <Title>El contexto de cada pedido.</Title>
      <Card>
        <Text style={s.sectionTitle}>
          {center?.name ?? "Selecciona un centro"}
        </Text>
        <Copy>
          Centro de demostración procedente de Supabase, compartido con el
          backoffice.
        </Copy>
        <Text style={s.fieldLabel}>Tipo de perfil</Text>
        <Text style={s.pill}>
          {user?.profileType === "INTERNAL_TEAM"
            ? "Equipo interno"
            : "Responsable de centro"}
        </Text>
        <Copy>
          El tipo de perfil orienta la experiencia. La asignación de centros y
          el rol de la cuenta determinan el acceso real.
        </Copy>
      </Card>
      <Card>
        <Text style={s.sectionTitle}>Acceso a la aplicación</Text>
        <Copy>
          {user
            ? `Sesión iniciada como ${user.name}. El servidor comprueba los centros autorizados para tu cuenta.`
            : "Puedes iniciar sesión desde la cabecera con una cuenta que tenga centros autorizados."}
        </Copy>
      </Card>
    </Shell>
  );
}
