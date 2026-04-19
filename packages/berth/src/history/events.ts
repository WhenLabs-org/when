export type HistoryEventType =
  | 'port-claimed'
  | 'port-released'
  | 'conflict-observed'
  | 'resolution-applied'
  | 'reservation-added'
  | 'reservation-removed';

export interface BaseEvent {
  type: HistoryEventType;
  at: string;
}

export interface PortClaimedEvent extends BaseEvent {
  type: 'port-claimed';
  port: number;
  pid: number;
  process: string;
  project?: string;
}

export interface PortReleasedEvent extends BaseEvent {
  type: 'port-released';
  port: number;
  pid: number;
}

export interface ConflictObservedEvent extends BaseEvent {
  type: 'conflict-observed';
  port: number;
  claimants: number;
  severity: 'error' | 'warning';
}

export interface ResolutionAppliedEvent extends BaseEvent {
  type: 'resolution-applied';
  port: number;
  action: 'kill' | 'reassign' | 'stop-service' | 'remap-docker';
  detail: string;
  success: boolean;
}

export interface ReservationAddedEvent extends BaseEvent {
  type: 'reservation-added';
  port: number;
  project: string;
  reason?: string;
}

export interface ReservationRemovedEvent extends BaseEvent {
  type: 'reservation-removed';
  port: number;
  project: string;
}

export type HistoryEvent =
  | PortClaimedEvent
  | PortReleasedEvent
  | ConflictObservedEvent
  | ResolutionAppliedEvent
  | ReservationAddedEvent
  | ReservationRemovedEvent;

export function now(): string {
  return new Date().toISOString();
}
