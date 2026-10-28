import { createRoot } from "react-dom/client";
import { chromeApi } from "../shared/chromeApi";
import { Onboarding } from "./Onboarding";
import { SidePanel } from "./SidePanel";
import { TestDrive } from "../testdrive/TestDrive";
import "./panel.css";
import "../testdrive/testdrive.css";

const view = document.body.dataset.view;
const root = createRoot(document.getElementById("root")!);
if (view === "onboarding") root.render(<Onboarding api={chromeApi} />);
else if (view === "testdrive") root.render(<TestDrive />);
else root.render(<SidePanel api={chromeApi} />);
