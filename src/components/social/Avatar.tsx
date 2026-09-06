import Image from "next/image";
import { avatarBackgroundCss, parsePresetAvatar, presetAvatarSrc } from "@/lib/avatars";

/**
 * Avatar: foto caricata, icona predefinita (silhouette bianca sullo sfondo
 * scelto dall'utente, nero di default, vedi `lib/avatars`) o iniziale su
 * sfumatura viola.
 */
export function Avatar({
  url,
  name,
  size = 40,
}: {
  url: string | null;
  name: string;
  size?: number;
}) {
  const preset = parsePresetAvatar(url);
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full bg-surface-2"
      style={{
        width: size,
        height: size,
        background: preset ? avatarBackgroundCss(preset.bg) : undefined,
      }}
    >
      {preset ? (
        <Image
          src={presetAvatarSrc(preset.id)}
          alt=""
          fill
          sizes={`${size}px`}
          className="object-cover"
        />
      ) : url ? (
        <Image src={url} alt="" fill sizes={`${size}px`} className="object-cover" />
      ) : (
        <span
          className="flex h-full items-center justify-center bg-gradient-to-br from-accent-soft to-accent-strong font-bold text-white"
          style={{ fontSize: size * 0.4 }}
        >
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}
