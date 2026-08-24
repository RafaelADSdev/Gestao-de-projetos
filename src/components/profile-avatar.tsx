import Image from "next/image";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";
}

export function ProfileAvatar({
  name,
  src,
  size = 34,
  className = "",
}: {
  name: string;
  src: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`profile-avatar ${className}`.trim()} style={{ width: size, height: size }}>
      {src ? (
        <Image src={src} alt={`Foto de ${name}`} width={size} height={size} sizes={`${size}px`} />
      ) : initials(name)}
    </span>
  );
}
