import { Outlet } from "react-router-dom";
import SiteHeader from "./SiteHeader";

export default function AppLayout() {
  return (
    <div className="sc-page flex min-h-screen flex-col">
      <div className="sc-page__glow" aria-hidden="true" />
      <SiteHeader />
      <main className="relative flex-1">
        <Outlet />
      </main>
    </div>
  );
}
