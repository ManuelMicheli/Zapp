export const TABS = [
  {
    href: "/",
    label: "Home",
    icon: (
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5Z" />
    ),
  },
  {
    href: "/search",
    label: "Cerca",
    icon: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.35-4.35" />
      </>
    ),
  },
  {
    href: "/library",
    label: "Libreria",
    // Marchio Zapp (la Z del logo, tracciata da docs/design/brand/zapp-z.jpeg): pieno,
    // non a tratto come le altre icone, cosi' al centro della pillola resta il logo.
    icon: (
      <path
        d="M21.46 2.87L21.95 2.74L22 2.74L21.95 2.87L12.04 14.32L12.09 14.42L12.48 14.42L20.95 13.73L21.27 13.76L21.29 13.93L2.12 21.26L2 21.26L3.47 19.35L6.71 15.44L13.26 7.8L13.14 7.63L4.71 7.6L4.71 7.56L7.74 6.6L12.28 5.28Z"
        fill="currentColor"
        stroke="none"
      />
    ),
  },
  {
    href: "/friends",
    label: "Amici",
    icon: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
        <circle cx="17.5" cy="9" r="2.5" />
        <path d="M16 14.2c3 .3 5.5 2.4 5.5 5.3" />
      </>
    ),
  },
  {
    href: "/profile",
    label: "Profilo",
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
      </>
    ),
  },
] as const;
