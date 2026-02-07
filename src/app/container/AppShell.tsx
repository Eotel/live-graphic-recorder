import { AppShellView } from "@/app/view/AppShellView";
import { useAppShellController } from "./useAppShellController";

export function AppShell() {
  const viewModel = useAppShellController();
  return <AppShellView viewModel={viewModel} />;
}

export default AppShell;
