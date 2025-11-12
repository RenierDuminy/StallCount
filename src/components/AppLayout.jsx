import { Outlet } from "react-router-dom";
import SiteHeader from "./SiteHeader";

export default function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
