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
    icon: (
      <>
        <path d="M4 5a1 1 0 0 1 1-1h3v16H5a1 1 0 0 1-1-1V5Z" />
        <path d="M10 4h4v16h-4z" />
        <path d="m16.5 4.6 3.9 1a1 1 0 0 1 .7 1.2L17.8 20l-3.9-1 3.6-14.4Z" />
      </>
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
