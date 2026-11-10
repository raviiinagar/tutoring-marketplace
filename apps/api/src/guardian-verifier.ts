import type {Config} from './config.js';

export interface GuardianEvidence {adult_reference:string;authority_reference:string}
export interface GuardianVerificationPolicy {
  id:string;notice_version:string;consent_version:string;notice:string;consent:string;
  test_only:boolean;approved_for_production:boolean;approval_reference:string;
}
// This boundary evaluates previously obtained evidence/receipts. External evidence
// acquisition belongs outside the database transaction and needs its own adapter.
export interface GuardianVerifier {
  readonly policy:GuardianVerificationPolicy;
  assess(evidence:GuardianEvidence):{identifiable_adult:boolean;lawful_authority:boolean};
}
// ADR 0015 retired child profiles and Guardian verification. No verifier is ever
// configured, so no child profile can become eligible again; the types remain for
// the historical rows that privacy export and erasure still read.
export function guardianVerifier(_config:Config):GuardianVerifier|undefined {return undefined;}
