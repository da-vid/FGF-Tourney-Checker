import { dashboardState } from "../app/page";
import { writeScoutExports } from "./scout-static";

await writeScoutExports(process.argv[2] ?? "public", dashboardState());
