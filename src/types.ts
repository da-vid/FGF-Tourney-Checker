export type SourceType =
  | "ast"
  | "legacy"
  | "tournamentConnect"
  | "tournamentConnectListing"
  | "pgfDiscovery"
  | "wcp"
  | "wcpSchedule"
  | "usssa";
export type CheckOutcome = "success" | "not_published" | "failure" | "not_checked";
export type TriState = "yes" | "no" | "unknown";
export type TournamentRole = "primary" | "alternate";
export type RegistrationState =
  | "open"
  | "limited"
  | "full"
  | "closed"
  | "waitlist"
  | "invite_only"
  | "not_public"
  | "not_published"
  | "unknown";
export type CapacityScope = "12U" | "event" | "location";

export interface TournamentConfig {
  id: string;
  name: string;
  organizer: string;
  startDate: string;
  endDate: string;
  location: string;
  division: "12U";
  weekendId: string;
  role: TournamentRole;
  sourceType: SourceType;
  sourceUrl: string;
  locationScope?: string;
  eventMatch?: string;
  entireEventIs12U?: boolean;
  status: "active" | "discovery";
}

export interface TeamRecord {
  rawName: string;
  normalizedName: string;
  confirmed: TriState;
  paid: TriState;
  note?: string;
}

export interface CollectionResult {
  tournamentId: string;
  checkedAt: string;
  outcome: CheckOutcome;
  officialName?: string;
  sourceUrl: string;
  teams: TeamRecord[];
  capacity?: number;
  spotsRemaining?: number;
  capacityScope?: CapacityScope;
  registrationState?: RegistrationState;
  registrationStatus?: string;
  registrationDeadline?: string;
  registrationUrl?: string;
  registrationObservedAt?: string;
  diagnostic?: string;
}

export interface PendingRemoval {
  team: TeamRecord;
  firstMissingAt: string;
  observations: number;
}

export type ChangeType =
  | "team_added"
  | "team_removed"
  | "confirmed_changed"
  | "paid_changed"
  | "event_published"
  | "registration_status_changed"
  | "spots_remaining_changed"
  | "registration_deadline_changed"
  | "source_unhealthy"
  | "source_recovered";

export interface ChangeRecord {
  id: string;
  tournamentId: string;
  occurredAt: string;
  type: ChangeType;
  teamName?: string;
  detail: string;
}

export interface TournamentState extends TournamentConfig {
  outcome: CheckOutcome;
  checkedAt?: string;
  lastSuccessfulCheck?: string;
  officialName?: string;
  teams: TeamRecord[];
  pendingRemovals: PendingRemoval[];
  capacity?: number;
  spotsRemaining?: number;
  capacityScope?: CapacityScope;
  registrationState?: RegistrationState;
  registrationStatus?: string;
  registrationDeadline?: string;
  registrationUrl?: string;
  registrationObservedAt?: string;
  diagnostic?: string;
}

export interface MonitorState {
  generatedAt: string;
  baselineEstablished: boolean;
  tournaments: TournamentState[];
  changes: ChangeRecord[];
}
