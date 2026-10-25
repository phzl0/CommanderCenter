import { useEffect, useRef, useState } from "react";
import { UserRound, Settings, Link, ShieldCheck, LogOut } from "lucide-react";
import type { User } from "./api";
export type AccountSection =
  "profile" | "preferences" | "connections" | "security";
export default function AccountMenu({
  user,
  onNavigate,
  onLogout,
  busy,
}: {
  user: User;
  onNavigate: (section: AccountSection) => void;
  onLogout: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    const frame = requestAnimationFrame(() =>
      root.current
        ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
        ?.focus(),
    );
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
      cancelAnimationFrame(frame);
    };
  }, [open]);
  const items = [
    { id: "profile", name: "Ver meu perfil", Icon: UserRound },
    { id: "preferences", name: "Preferências", Icon: Settings },
    { id: "connections", name: "Conexões", Icon: Link },
    { id: "security", name: "Segurança", Icon: ShieldCheck },
  ] as const;
  return (
    <div
      className="account-menu"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        className="profile-trigger"
        ref={trigger}
        aria-label="Abrir menu do perfil"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {user.has_avatar ? (
          <img
            src={`/api/account/avatar?v=${user.avatar_version}`}
            alt="Minha foto"
          />
        ) : (
          <span>{user.name.slice(0, 1).toUpperCase()}</span>
        )}
      </button>
      {open && (
        <div
          className="profile-menu"
          role="menu"
          aria-label="Opções da conta"
          onKeyDown={(e) => {
            if (!["ArrowDown", "ArrowUp"].includes(e.key)) return;
            e.preventDefault();
            const buttons = Array.from(
              root.current!.querySelectorAll<HTMLButtonElement>(
                '[role="menuitem"]',
              ),
            );
            const i = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            buttons[
              (i + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) %
                buttons.length
            ]?.focus();
          }}
        >
          <div className="profile-menu-heading">
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </div>
          {items.map(({ id, name, Icon }) => (
            <button
              role="menuitem"
              key={id}
              onClick={() => {
                setOpen(false);
                onNavigate(id);
              }}
            >
              <Icon size={16} />
              {name}
            </button>
          ))}
          <button
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
