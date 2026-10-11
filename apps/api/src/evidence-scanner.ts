import {createConnection} from 'node:net';
import type {Config} from './config.js';
export type ScanOutcome='CLEAN'|'REJECTED'|'ERROR';
export interface EvidenceScanner {readonly testOnly:boolean;scan(bytes:Buffer):Promise<ScanOutcome>}
export class TestEvidenceScanner implements EvidenceScanner {
  readonly testOnly=true;
  async scan(bytes:Buffer):Promise<ScanOutcome>{const text=bytes.toString('latin1');if(text.includes('EICAR')||text.includes('MALICIOUS-FIXTURE'))return 'REJECTED';return text.includes('FICTIONAL-TUTOR-EVIDENCE')&&!text.includes('SCAN-ERROR-FIXTURE')?'CLEAN':'ERROR';}
}
// ClamD INSTREAM avoids giving the scanner access to database/storage paths.
// Only an exact OK response releases quarantine; errors/timeouts fail closed.
export class ClamAvScanner implements EvidenceScanner {
  readonly testOnly=false;
  constructor(private readonly host:string,private readonly port:number){}
  scan(bytes:Buffer):Promise<ScanOutcome>{return new Promise(resolve=>{
    const socket=createConnection({host:this.host,port:this.port});let response=Buffer.alloc(0);let done=false;
    const finish=(outcome:ScanOutcome)=>{if(done)return;done=true;clearTimeout(deadline);socket.destroy();resolve(outcome);};
    const deadline=setTimeout(()=>finish('ERROR'),15_000);socket.on('error',()=>finish('ERROR'));socket.on('close',()=>finish('ERROR'));
    socket.on('end',()=>{if(response.length===0||response.indexOf(0)!==response.length-1){finish('ERROR');return;}const result=response.subarray(0,-1).toString('utf8');finish(result==='stream: OK'?'CLEAN':/^stream: .+ FOUND$/.test(result)?'REJECTED':'ERROR');});
    socket.on('connect',()=>{socket.write('zINSTREAM\0');for(let offset=0;offset<bytes.length;offset+=65536){const chunk=bytes.subarray(offset,offset+65536);const size=Buffer.alloc(4);size.writeUInt32BE(chunk.length);socket.write(size);socket.write(chunk);}socket.write(Buffer.alloc(4));});
    socket.on('data',chunk=>{response=Buffer.concat([response,chunk]);if(response.length>4096)finish('ERROR');});
  });}
}
export function evidenceScanner(config:Config):EvidenceScanner|undefined {if(config.evidenceScanner==='test')return new TestEvidenceScanner();if(config.evidenceScanner==='clamav'&&config.clamav)return new ClamAvScanner(config.clamav.host,config.clamav.port);return undefined;}
