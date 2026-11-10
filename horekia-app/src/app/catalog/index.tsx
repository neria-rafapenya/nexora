import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Link } from "expo-router";
import { products, money } from "../../domain/demo";
import {
  Shell,
  Label,
  Title,
  Copy,
  Card,
  Button,
  Field,
  s,
} from "../../components/ui";
import { useWorkspace } from "../../components/workspace";
export default function Catalog() {
  const [q, setQ] = useState("");
  const [family, setFamily] = useState("Todos");
  const { add, notify, center } = useWorkspace();
  const rows = products.filter(
    (p) =>
      (family === "Todos" || p.family === family) &&
      (p.name + " " + p.sku)
        .toLocaleLowerCase("es")
        .includes(q.toLocaleLowerCase("es")),
  );
  return (
    <Shell>
      <Label>CATÁLOGO</Label>
      <Title>Lo que tu cocina necesita.</Title>
      <Copy>
        Precios y referencias ilustrativos. Consulta la ficha antes de elegir un
        producto.
      </Copy>
      <Field
        label="Buscar productos"
        value={q}
        onChangeText={setQ}
        placeholder="Nombre o referencia…"
      />
      <View style={s.row}>
        {["Todos", ...new Set(products.map((p) => p.family))].map((f) => (
          <Pressable key={f} onPress={() => setFamily(f)}>
            <Text
              style={[
                s.pill,
                family === f && { backgroundColor: "#174c3e", color: "white" },
              ]}
            >
              {f}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.copy}>{rows.length} productos</Text>
      <View style={s.row}>
        {rows.map((p) => (
          <Card
            key={p.id}
            style={{ flexGrow: 1, flexBasis: 260, maxWidth: 420 }}
          >
            <View
              style={{
                backgroundColor: p.color,
                height: 110,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 64, color: "#74846c" }}>{p.symbol}</Text>
            </View>
            <Label>
              {p.family.toUpperCase()} · {p.sku}
            </Label>
            <Link
              href={{ pathname: "/catalog/[id]", params: { id: p.id } }}
              style={s.sectionTitle}
            >
              {p.name}
            </Link>
            <Text style={s.copy}>
              {money(p.price)} / {p.unit} · Precio de ejemplo
            </Text>
            <Button
              label="Añadir a la cesta"
              disabled={!center}
              secondary
              onPress={() => {
                add(p.id);
                notify(p.name + " añadido a la cesta.");
              }}
            />
          </Card>
        ))}
      </View>
      {rows.length === 0 && (
        <Copy>
          No hay productos que coincidan. Prueba otro nombre o categoría.
        </Copy>
      )}
    </Shell>
  );
}
