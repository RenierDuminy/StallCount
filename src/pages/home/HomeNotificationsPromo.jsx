import { Link } from "react-router-dom";
import { Panel } from "../../components/ui/primitives";

/**
 * Signed-out counterpart of "Your notifications": one line on how alerts
 * work and a way to log in. Deliberately small — it sits between Events and
 * Latest results and should not compete with them.
 */
export function HomeNotificationsPromo() {
  return (
    <Panel variant="tinted" className="home-promo-card">
      <p className="home-promo-card__text">
        Log in and choose the events, teams or players to follow for score alerts.
      </p>
      <Link to="/login" className="sc-header-button is-primary">
        Log in
      </Link>
    </Panel>
  );
}
