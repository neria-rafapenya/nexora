import { useWorkspace } from "../components/workspace";
import { Text } from "react-native";
import { Shell, Label, Title, Copy, Card, s } from "../components/ui";
export default function Profile() {
  const { center } = useWorkspace();
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
        <Text style={s.pill}>Comprador de un centro</Text>
        <Copy>
          Este distintivo orientará la experiencia tras iniciar sesión. Los
          permisos reales también requerirán la vinculación al cliente y a los
          centros autorizados.
        </Copy>
      </Card>
      <Card>
        <Text style={s.sectionTitle}>Acceso a la aplicación</Text>
        <Copy>
          El acceso de clientes y centros está pendiente de conexión. No
          introduzcas tus credenciales del backoffice en esta demostración.
        </Copy>
      </Card>
    </Shell>
  );
}
