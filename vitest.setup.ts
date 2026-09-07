import { vi } from "vitest";

// Mock useToast before any modules that import it are loaded
vi.mock("@/components/ui/Toaster", () => ({
  useToast: () => ({
    show: vi.fn(),
  }),
}));
