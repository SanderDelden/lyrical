// The Lyrical logo: three lines of lyrics with the one being sung lit up,
// followed by the name. The mark takes its colours from the theme;
// public/icon.svg is the same mark on a dark tile, for the favicon.
export function Logo() {
  return (
    <p className="logo">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2" y="4.25" width="11" height="3.5" rx="1.75" opacity="0.35" />
        <rect className="logo-active" x="2" y="10.25" width="20" height="3.5" rx="1.75" />
        <rect x="2" y="16.25" width="15" height="3.5" rx="1.75" opacity="0.35" />
      </svg>
      Lyrical
    </p>
  );
}
