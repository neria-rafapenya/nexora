import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { router } from "expo-router";
import {
  Shell,
  Label,
  Title,
  Copy,
  Card,
  Button,
  Field,
  s,
} from "../components/ui";
import { useWorkspace } from "../components/workspace";
import { clientRequest } from "../infrastructure/api";
type Line = {
  id: string;
  productId: string | null;
  name: string;
  originalText: string;
  quantity: number;
  unit: string;
  state: string;
  sku: string | null;
};
type Proposal = {
  orderId: string;
  number: string;
  centerId: string;
  companyId: string;
  deliveryDate: string | null;
  usedToday: number;
  maxDailyRequests: number;
  lines: Line[];
};
type Editable = Line & { quantityText: string };
type AiStatus = {
  available: boolean;
  usedToday: number;
  maxDailyRequests: number;
};
const unitCode = (unit: string) =>
  (
    ({
      kg: "KG",
      l: "L",
      ud: "UNIT",
      caja: "BOX",
      KG: "KG",
      L: "L",
      UNIT: "UNIT",
      BOX: "BOX",
    }) as Record<string, string>
  )[unit] ?? "UNKNOWN";
export default function Assistant() {
  const { add, notify, center, catalog, mode } = useWorkspace();
  const scope = (center?.companyId ?? "") + ":" + (center?.id ?? "");
  const [text, setText] = useState("");
  const [demoConfirmed, setDemoConfirmed] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ scope: string; text: string } | null>(
    null,
  );
  const [status, setStatus] = useState<{
    scope: string;
    data: AiStatus;
  } | null>(null);
  const [result, setResult] = useState<{
    scope: string;
    source: string;
    proposal: Proposal;
    lines: Editable[];
  } | null>(null);
  useEffect(() => {
    let live = true;
    if (mode !== "AUTHENTICATED" || !center) return;
    clientRequest<AiStatus>(
      "/assistant/status?center=" +
        encodeURIComponent(center.id) +
        "&company=" +
        encodeURIComponent(center.companyId ?? ""),
    )
      .then((data) => {
        if (live) setStatus({ scope, data });
      })
      .catch((e) => {
        if (live) setError({ scope, text: e.message });
      });
    return () => {
      live = false;
    };
  }, [mode, center, scope]);
  const active =
    result?.scope === scope && result.source === text ? result : null;
  const aiStatus = status?.scope === scope ? status.data : null;
  const validLine = (line: Editable) => {
    const product = catalog.find((p) => p.id === line.productId);
    const quantity = Number(line.quantityText.replace(",", "."));
    return (
      !!product &&
      line.quantityText.trim() !== "" &&
      Number.isFinite(quantity) &&
      quantity > 0 &&
      quantity <= 1000000 &&
      Math.abs(quantity * 1000 - Math.round(quantity * 1000)) < 0.000001 &&
      line.unit === unitCode(product.unit)
    );
  };
  const changeLine = (index: number, patch: Partial<Editable>) => {
    setReviewed(false);
    setResult((old) =>
      old
        ? {
            ...old,
            lines: old.lines.map((l, i) =>
              i === index ? { ...l, ...patch } : l,
            ),
          }
        : old,
    );
  };
  return (
    <Shell>
      <Label>ASISTENTE CUINORA</Label>
      <Title>Cuéntanos qué necesitas.</Title>
      <Copy>
        Escribe o pega tu pedido. La IA propondrá referencias del catálogo del
        centro activo para que puedas revisarlas antes de añadirlas a la cesta.
      </Copy>
      <Card>
        <Field
          label="Tu pedido"
          value={text}
          onChangeText={(value) => {
            setText(value);
            setReviewed(false);
          }}
          multiline
          placeholder="Ej.: Necesito 20 kg de muslo de pollo, 4 kg de fideos de arroz y 4,8 kg de arroz basmati. Para el viernes que viene."
        />
        <Copy>
          {text.length} / 12000 caracteres · Centro:{" "}
          {center?.name ?? "Selecciona un centro"}
        </Copy>
        <Button
          secondary
          label="Cargar un ejemplo editable"
          disabled={busy}
          onPress={() => {
            setText(
              "Necesito 20 kg de muslo de pollo, 4 kg de fideos de arroz y 4,8 kg de arroz basmati. Para el viernes que viene.",
            );
            setReviewed(false);
          }}
        />
        {mode !== "AUTHENTICATED" ? (
          <>
            <Copy>
              Inicia sesión para interpretar tu texto con Gemini y el catálogo
              de tu empresa.
            </Copy>
            <Button
              label="Iniciar sesión"
              onPress={() => router.push("/login")}
            />
          </>
        ) : (
          <>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: demoConfirmed }}
              onPress={() => setDemoConfirmed((v) => !v)}
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <Text style={s.pill}>{demoConfirmed ? "✓" : "□"}</Text>
              <View style={{ flex: 1 }}>
                <Copy>
                  Confirmo que es un pedido ficticio de esta POC, sin datos
                  personales de comensales. El texto se enviará a Gemini.
                </Copy>
              </View>
            </Pressable>
            {aiStatus && (
              <Copy>
                {aiStatus.available
                  ? `Interpretaciones utilizadas hoy: ${aiStatus.usedToday} de ${aiStatus.maxDailyRequests}.`
                  : "La interpretación con IA no está disponible. Consulta con el administrador."}
              </Copy>
            )}
            <Button
              label={busy ? "Interpretando pedido…" : "Interpretar mi pedido"}
              disabled={
                busy ||
                !center ||
                text.trim().length < 3 ||
                text.length > 12000 ||
                !demoConfirmed ||
                !aiStatus?.available
              }
              onPress={async () => {
                if (!center) return;
                const requestScope = scope;
                const source = text;
                setBusy(true);
                setError(null);
                setReviewed(false);
                setResult(null);
                try {
                  const proposal = await clientRequest<Proposal>(
                    "/assistant/interpret",
                    "POST",
                    {
                      companyId: center.companyId,
                      centerId: center.id,
                      text: source,
                      demoConfirmed: true,
                    },
                  );
                  setResult({
                    scope: requestScope,
                    source,
                    proposal,
                    lines: proposal.lines.map((l) => ({
                      ...l,
                      quantityText: l.quantity > 0 ? String(l.quantity) : "",
                    })),
                  });
                  setStatus((old) =>
                    old?.scope === requestScope
                      ? {
                          ...old,
                          data: {
                            ...old.data,
                            usedToday: proposal.usedToday,
                          },
                        }
                      : old,
                  );
                } catch (e) {
                  setError({ scope: requestScope, text: (e as Error).message });
                } finally {
                  setBusy(false);
                }
              }}
            />
          </>
        )}
        {text.length > 12000 && (
          <Text role="alert" style={{ fontSize: 13, color: "#a33728" }}>
            El pedido supera los 12000 caracteres. Acórtalo antes de
            interpretarlo.
          </Text>
        )}
        {error?.scope === scope && (
          <Text role="alert" style={{ fontSize: 13, color: "#a33728" }}>
            {error.text}
          </Text>
        )}
      </Card>
      {active && (
        <Card>
          <Text style={s.pill}>
            Borrador {active.proposal.number} · Preparado con IA
          </Text>
          <Text style={s.sectionTitle}>
            Revisa productos, cantidades y unidades.
          </Text>
          <Copy>
            La lectura original queda como borrador en el backoffice. Los
            ajustes de esta pantalla se aplican a tu cesta de prueba; no envían
            ni aprueban el pedido.
          </Copy>
          {active.proposal.deliveryDate && (
            <Copy>
              Fecha identificada:{" "}
              {new Date(
                active.proposal.deliveryDate + "T12:00:00",
              ).toLocaleDateString("es-ES")}
              . Confírmala en el calendario de la cesta.
            </Copy>
          )}
          {!active.proposal.deliveryDate && (
            <Copy>
              Falta una fecha concreta de entrega. Podrás elegirla con el
              calendario de la cesta.
            </Copy>
          )}
          {active.lines.map((line, index) => (
            <View
              key={line.id}
              style={{
                gap: 10,
                borderTopWidth: 1,
                borderColor: "#e2e7df",
                paddingTop: 18,
              }}
            >
              <Copy>Texto original: {line.originalText}</Copy>
              <Text style={s.fieldLabel}>Producto</Text>
              <Picker
                accessibilityLabel={"Producto de la línea " + (index + 1)}
                selectedValue={line.productId ?? ""}
                onValueChange={(value) =>
                  changeLine(index, { productId: String(value) || null })
                }
              >
                <Picker.Item label="Selecciona un producto" value="" />
                {catalog.map((p) => (
                  <Picker.Item
                    key={p.id}
                    label={p.name + " · " + p.sku}
                    value={p.id}
                  />
                ))}
              </Picker>
              <Field
                label={"Cantidad de la línea " + (index + 1)}
                value={line.quantityText}
                onChangeText={(quantityText) =>
                  changeLine(index, { quantityText })
                }
              />
              <Text style={s.fieldLabel}>Unidad</Text>
              <Picker
                accessibilityLabel={"Unidad de la línea " + (index + 1)}
                selectedValue={line.unit}
                onValueChange={(unit) =>
                  changeLine(index, { unit: String(unit) })
                }
              >
                {[
                  ["UNKNOWN", "Seleccionar…"],
                  ["KG", "kg"],
                  ["L", "litros"],
                  ["BOX", "cajas"],
                  ["UNIT", "unidades"],
                ].map(([code, label]) => (
                  <Picker.Item key={code} label={label} value={code} />
                ))}
              </Picker>
              {!validLine(line) && (
                <Text style={{ fontSize: 13, color: "#a33728" }}>
                  Completa el producto y una cantidad válida. La unidad debe
                  coincidir con la del catálogo; no convertimos cajas a kg
                  automáticamente.
                </Text>
              )}
              <Button
                secondary
                label="Quitar línea"
                onPress={() => {
                  setReviewed(false);
                  setResult({
                    ...active,
                    lines: active.lines.filter((_, i) => i !== index),
                  });
                }}
              />
            </View>
          ))}
          <Copy>
            Las restricciones de dietas y alérgenos requieren revisión. Esta
            propuesta no acredita compatibilidad alimentaria.
          </Copy>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: reviewed }}
            onPress={() => setReviewed((v) => !v)}
            style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
          >
            <Text style={s.pill}>{reviewed ? "✓" : "□"}</Text>
            <Copy>
              He revisado los productos, las cantidades y las unidades.
            </Copy>
          </Pressable>
          <Button
            label="Añadir propuesta revisada a mi cesta"
            disabled={
              !reviewed ||
              !active.lines.length ||
              !active.lines.every(validLine)
            }
            onPress={() => {
              if (
                active.scope !== scope ||
                active.proposal.centerId !== center?.id
              )
                return;
              for (const line of active.lines)
                add(
                  line.productId!,
                  Number(line.quantityText.replace(",", ".")),
                );
              notify(
                "Propuesta añadida a la cesta de prueba. Revisa la fecha antes de continuar.",
              );
              setResult(null);
              router.push({
                pathname: "/orders/new",
                params: {
                  delivery: active.proposal.deliveryDate ?? "",
                  center: center?.id ?? "",
                },
              });
            }}
          />
        </Card>
      )}
    </Shell>
  );
}
