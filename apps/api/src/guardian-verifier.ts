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
export class TestGuardianVerifier implements GuardianVerifier {
  readonly policy={id:'test-guardian-v1',notice_version:'test-notice-v1',consent_version:'test-consent-v1',test_only:true,approved_for_production:false,approval_reference:'NONPRODUCTION-FIXTURES-ONLY',notice:'Fictional testing only. Do not enter real child information or real identity documents.',consent:'I am testing with fictional data and accept this test-only Guardian and Learner profile workflow.'};
  assess(evidence:GuardianEvidence){return {identifiable_adult:evidence.adult_reference==='test-adult-confirmed',lawful_authority:evidence.authority_reference==='test-authority-confirmed'};}
}
export function guardianVerifier(config:Config):GuardianVerifier|undefined {return config.guardianMode==='test'&&config.mode!=='production'?new TestGuardianVerifier():undefined;}
