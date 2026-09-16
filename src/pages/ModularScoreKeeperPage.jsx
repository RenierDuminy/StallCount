import { useSearchParams } from "react-router-dom";
import ModularScoreKeeperView from "./scorekeeper/ModularScoreKeeperView";
import ModularScorekeeperLanding from "./scorekeeper/ModularScorekeeperLanding";
import {
  isScorekeeperFormatKey,
  resolveScorekeeperFormat,
} from "./scorekeeper/scorekeeperFormats";

/**
 * The modular scorekeeper console.
 *
 * `/score-keeper` with no valid `?mode=` is the landing page, where the
 * operator picks a format. With one, the format is resolved here — once — and
 * handed down as a prop. This is the only place the URL is translated into a
 * format, so the console and everything under it read a descriptor rather than
 * testing for a format key.
 *
 * `?mode=` accepts the internal keys (`full` / `lite`) and the legacy player-count
 * spellings (`7v7` / `5v5`), which existing links still use.
 */
export default function ModularScoreKeeperPage() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode");
  if (!isScorekeeperFormatKey(mode)) {
    return <ModularScorekeeperLanding />;
  }
  const format = resolveScorekeeperFormat(mode);
  // Keyed by format so switching tears the controller down rather than
  // reconciling a live match's state into a different rule set.
  return <ModularScoreKeeperView key={format.key} format={format.key} />;
}
