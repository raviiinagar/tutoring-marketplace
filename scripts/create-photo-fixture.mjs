import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import sharp from 'sharp';
if(process.env.NODE_ENV==='production')throw new Error('Fictional photo fixtures are forbidden in production.');
const directory=resolve('.local');await mkdir(directory,{recursive:true});
const path=resolve(directory,'fictional-tutor-photo.jpg');
await sharp({create:{width:320,height:400,channels:3,background:'#d589ab'}}).withMetadata({exif:{IFD0:{ImageDescription:'FICTIONAL-TUTOR-EVIDENCE'}}}).jpeg().toFile(path);
console.log('Fictional image fixture created: .local/fictional-tutor-photo.jpg');
