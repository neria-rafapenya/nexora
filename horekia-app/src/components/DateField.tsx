import { useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { localDateISO } from "../domain/delivery-date";
import type { DateFieldProps } from "./DateField.types";
import { s, Button } from "./ui";
export function DateField({ label, value, min, onChange }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        style={s.input}
      >
        <Text style={s.copy}>
          {value
            ? new Date(value + "T12:00:00").toLocaleDateString("es-ES")
            : "Seleccionar fecha"}
        </Text>
      </Pressable>
      {open && (
        <DateTimePicker
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          value={new Date((value || min) + "T12:00:00")}
          minimumDate={new Date(min + "T00:00:00")}
          onDismiss={() => setOpen(false)}
          onValueChange={(_event, date) => {
            onChange(localDateISO(date));
            if (Platform.OS !== "ios") setOpen(false);
          }}
        />
      )}
      {open && Platform.OS === "ios" && (
        <Button label="Listo" secondary onPress={() => setOpen(false)} />
      )}
    </View>
  );
}
