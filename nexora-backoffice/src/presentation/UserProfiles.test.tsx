// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  UserManagement,
  SelfProfile,
  ActivateAccount,
  type ManagedUser,
} from "./UserProfiles";
import { request } from "../infrastructure/api";
import type { Session } from "../domain/core";
vi.mock("../infrastructure/api", () => ({ request: vi.fn() }));
vi.mock("../infrastructure/useDataRefresh", () => ({
  useDataRefresh: () => 0,
}));
let host: HTMLDivElement, root: Root, users: ManagedUser[], self: Session;
const now = "2026-11-10T12:00:00Z";
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  users = [
    {
      id: "other",
      name: "Other user",
      email: "other@example.test",
      phone: "123",
      jobTitle: "Chef",
      role: "quality",
      profileVersion: 2,
      accessVersion: 1,
      pendingActivation: false,
      canEditProfile: true,
      avatarUrl: null,
      createdAt: now,
      updatedAt: now,
    },
  ];
  self = {
    id: "self",
    name: "My name",
    email: "me@example.test",
    phone: "",
    jobTitle: "",
    profileVersion: 3,
    companies: [{ id: "workspace", name: "Workspace", role: "admin" }],
  };
  vi.mocked(request).mockReset();
  vi.mocked(request).mockImplementation(
    async (path, _company, method = "GET", body) => {
      if (path === "/users" && method === "GET")
        return { users: structuredClone(users) } as never;
      if (path === "/profile" && method === "GET")
        return { user: structuredClone(self) } as never;
      if (path === "/profile" && method === "PUT") {
        const b = body as { data: Partial<Session> };
        self = { ...self, ...b.data, profileVersion: 4 };
        return { user: self } as never;
      }
      if (path === "/profile/password")
        return { ok: true, user: { ...self, profileVersion: 4 } } as never;
      if (path === "/users" && method === "POST")
        return {
          activationPath: "/activate#token=" + "a".repeat(64),
          expiresAt: now,
        } as never;
      if (path === "/users/other" && method === "PUT") {
        const b = body as {
          role: string;
          profile?: { data: Partial<ManagedUser> };
        };
        users[0] = {
          ...users[0],
          ...b.profile?.data,
          role: b.role,
          profileVersion: 3,
          accessVersion: 2,
        };
        return { user: users[0] } as never;
      }
      if (method === "DELETE") {
        users = [];
        return { ok: true } as never;
      }
      return { ok: true } as never;
    },
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  window.history.replaceState(null, "", "/");
});
async function render(kind = "users") {
  await act(async () =>
    root.render(
      <MemoryRouter>
        {kind === "users" ? (
          <UserManagement
            companyId="workspace"
            selfId="self"
            roles={{
              admin: "Administración",
              quality: "Calidad",
              read_only: "Lectura",
            }}
          />
        ) : kind === "profile" ? (
          <SelfProfile onUser={() => {}} />
        ) : (
          <ActivateAccount />
        )}
      </MemoryRouter>,
    ),
  );
}
async function click(label: string) {
  const button = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === label || b.getAttribute("aria-label") === label,
  )!;
  await act(async () => button.click());
}
async function edit(label: string, value: string) {
  const n = [...host.querySelectorAll("label")]
    .find((l) => l.textContent?.startsWith(label))!
    .querySelector<HTMLInputElement | HTMLSelectElement>("input,select")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      n instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype,
      "value",
    )!.set!.call(n, value);
    n.dispatchEvent(
      new Event(n instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}
async function submit(label: string) {
  await act(async () =>
    host
      .querySelector(`form[aria-label="${label}"]`)!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
it("edits profiles/roles with versions and no password controls, then confirms access removal", async () => {
  await render();
  await click("Editar a Other user");
  expect(host.querySelector("input[type=password]")).toBeNull();
  await edit("Nombre", "Edited user");
  await submit("Editar usuario");
  expect(request).toHaveBeenCalledWith(
    "/users/other",
    "workspace",
    "PUT",
    expect.objectContaining({
      accessVersion: 1,
      profile: expect.objectContaining({
        version: 2,
        data: expect.objectContaining({ name: "Edited user" }),
      }),
    }),
  );
  expect(host.textContent).toContain("Edited user");
  await click("Eliminar a Edited user");
  expect(vi.mocked(request).mock.calls.some((c) => c[2] === "DELETE")).toBe(
    false,
  );
  await click("Confirmar eliminación");
  expect(request).toHaveBeenCalledWith("/users/other", "workspace", "DELETE", {
    accessVersion: 2,
  });
});
it("creates pending accounts with an activation link instead of an administrator-selected password", async () => {
  await render();
  await click("Añadir usuario");
  expect(host.querySelector("input[type=password]")).toBeNull();
  await edit("Nombre", "New user");
  await edit("Correo electrónico", "new@example.test");
  await submit("Editar usuario");
  expect(request).toHaveBeenCalledWith(
    "/users",
    "workspace",
    "POST",
    expect.objectContaining({
      profile: expect.objectContaining({
        name: "New user",
        email: "new@example.test",
      }),
    }),
  );
  expect(
    host.querySelector<HTMLInputElement>(
      'input[aria-label="Enlace de activación"]',
    )!.value,
  ).toContain("/activate#token=");
  expect(host.textContent).toContain("No se ha enviado ningún correo");
});
it("shared profiles cannot be edited by an administrator outside their other companies", async () => {
  users[0].canEditProfile = false;
  await render();
  await click("Editar a Other user");
  expect(
    [...host.querySelectorAll("label")]
      .find((l) => l.textContent?.startsWith("Nombre"))!
      .querySelector("input")!.disabled,
  ).toBe(true);
  await edit("Rol", "read_only");
  await submit("Editar usuario");
  expect(request).toHaveBeenCalledWith("/users/other", "workspace", "PUT", {
    role: "read_only",
    accessVersion: 1,
  });
});
it("keeps conflicting drafts and rejects oversized avatars through toasts without uploads", async () => {
  await render();
  await click("Editar a Other user");
  await edit("Nombre", "Unsaved");
  vi.mocked(request).mockRejectedValueOnce(
    Object.assign(
      new Error("El perfil ha cambiado. Recarga antes de guardar."),
      { status: 409 },
    ),
  );
  await submit("Editar usuario");
  expect(host.textContent).toContain("El perfil ha cambiado");
  expect(
    [...host.querySelectorAll("label")]
      .find((l) => l.textContent?.startsWith("Nombre"))!
      .querySelector("input")!.value,
  ).toBe("Unsaved");
  const input = host.querySelector<HTMLInputElement>("input[type=file]")!;
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [
      new File([new Uint8Array(1_000_001)], "avatar.png", {
        type: "image/png",
      }),
    ],
  });
  await act(async () =>
    input.dispatchEvent(new Event("change", { bubbles: true })),
  );
  expect(host.textContent).toContain("La imagen supera el máximo de 1 MB");
});
it("self-service profile and password routes do not accept a target account or expose password fields to admin", async () => {
  await render("profile");
  await edit("Nombre", "My updated name");
  await submit("Mi perfil");
  expect(request).toHaveBeenCalledWith("/profile", "", "PUT", {
    version: 3,
    data: { name: "My updated name", phone: "", jobTitle: "" },
  });
  await edit("Contraseña actual", "Old password here");
  await edit("Nueva contraseña", "New password here");
  await edit("Repite la nueva contraseña", "Different password");
  await submit("Cambiar contraseña");
  expect(host.textContent).toContain("no coinciden");
  expect(
    vi.mocked(request).mock.calls.some((c) => c[0] === "/profile/password"),
  ).toBe(false);
  await edit("Repite la nueva contraseña", "New password here");
  await submit("Cambiar contraseña");
  expect(request).toHaveBeenCalledWith("/profile/password", "", "PUT", {
    currentPassword: "Old password here",
    newPassword: "New password here",
  });
  expect(host.textContent).toContain("Contraseña actualizada");
});
it("activation scrubs the token fragment and asks the invited user to choose their password", async () => {
  const token = "a".repeat(64);
  window.history.replaceState(null, "", "/activate#token=" + token);
  await render("activate");
  expect(window.location.hash).toBe("");
  await edit("Nueva contraseña", "My personal password");
  await edit("Repite la contraseña", "My personal password");
  await submit("Activar cuenta");
  expect(request).toHaveBeenCalledWith("/account/activate", "", "POST", {
    token,
    password: "My personal password",
  });
  expect(host.textContent).toContain("Tu contraseña ya está configurada");
});
