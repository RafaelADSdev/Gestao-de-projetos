import Image from "next/image";
import Link from "next/link";
import { APP_LOGO_SRC, APP_NAME_SUFFIX, APP_SHORT_NAME } from "@/lib/domain/constants";

type BrandMarkSize = "sm" | "md" | "lg";

const LOGO_SIZES: Record<BrandMarkSize, number> = {
  sm: 32,
  md: 38,
  lg: 48,
};

export function BrandMark({ size = "md" }: { size?: BrandMarkSize }) {
  const px = LOGO_SIZES[size];

  return (
    <span className={`brand-mark brand-mark--${size}`}>
      <Image
        src={APP_LOGO_SRC}
        alt=""
        width={px}
        height={px}
        className="brand-mark-image"
        priority={size !== "sm"}
      />
    </span>
  );
}

export function BrandLockup({
  href = "/",
  light = false,
  compact = false,
  label,
}: {
  href?: string;
  light?: boolean;
  compact?: boolean;
  label?: string;
}) {
  const className = `brand${light ? " light" : ""}${compact ? " brand--compact" : ""}`;
  const content = (
    <>
      <BrandMark size={compact ? "sm" : "md"} />
      {!compact && (
        <span>
          <strong>{APP_SHORT_NAME}</strong>
          <small>{APP_NAME_SUFFIX}</small>
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className} aria-label={label ?? `${APP_SHORT_NAME} — início`}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
