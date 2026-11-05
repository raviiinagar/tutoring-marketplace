import {compactTutorLocation,compactTutorRate} from './tutor-card-summary';
import {TutorPortrait} from './tutor-portrait';
import {Link} from '@tanstack/react-router';
import {Star} from 'lucide-react';
import type {Catalogue,PublicOffer,TeachingOffer} from '@/lib/api';
export function PublicOfferTerms({offer,catalogue}:{offer:TeachingOffer;catalogue:Catalogue|undefined}){
  const label=(id:string)=>catalogue?.terms.find(t=>t.id===id)?.label||id;
  return <div className="space-y-3 text-sm"><p className="text-muted-foreground">{[offer.subject_id,offer.level_id,offer.curriculum_id,offer.exam_id].filter((id):id is string=>!!id).map(label).join(' · ')}</p><p>{offer.teaching_mode==='IN_PERSON'?'In person':'Online'} · {offer.language_ids.map(label).join(', ')}</p>{offer.class_location&&<p>{[offer.class_location.area,offer.class_location.city,offer.class_location.country].filter(Boolean).join(', ')}</p>}<p className="font-display text-xl font-semibold">₹{(offer.rate_paise/100).toFixed(2)} <span className="font-sans text-sm font-normal text-muted-foreground">/ {offer.rate_unit==='HOUR'?'hour':`lesson (${offer.lesson_minutes} min)`}</span></p><p>{offer.trial_kind==='NONE'?'No trial offered':`${offer.trial_kind==='FREE'?'Free trial':`Paid trial: ₹${((offer.trial_price_paise||0)/100).toFixed(2)}`} · ${offer.trial_minutes} minutes`}</p></div>;
}
export function PublicOfferCard({listing,catalogue,priority=false}:{listing:PublicOffer;catalogue:Catalogue|undefined;priority?:boolean}){
  const name=listing.tutor.display_name;
  const slug=listing.public_path?.slice(10)||listing.offer.subject_id.replace(/^subject-/,'')+'-'+listing.id;
  const subject=catalogue?.terms.find(t=>t.id===listing.offer.subject_id)?.label||listing.offer.subject_id.replace(/^subject-/,'');
  const summary=listing.review_summary;
  return <article className="teacher-card">
    <Link to="/teachers/$slug" params={{slug}} className="teacher-cover">
      <span aria-hidden className="teacher-initials">{name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase()}</span>
      <TutorPortrait card priority={priority} url={listing.tutor.photo_url} name={name} className="teacher-portrait"/>
      <div className="teacher-cover-caption"><h3 className="teacher-cover-name">{name}</h3><p className="teacher-cover-location">{compactTutorLocation(listing.presence,listing.offer.teaching_mode)}</p></div>
    </Link>
    <div className="teacher-card-details">
      {summary&&summary.count>0&&summary.average!==null&&<p className="teacher-card-rating" aria-label={`${summary.average.toFixed(1)} out of 5 from ${summary.count} connection-linked reviews`}><Star aria-hidden className="size-4 fill-amber-400 text-amber-400"/>{Number(summary.average.toFixed(1))} <span>({summary.count} {summary.count===1?'review':'reviews'})</span></p>}
      <h2 className="teacher-card-summary font-normal"><Link to="/teachers/$slug" params={{slug}}><span className="font-medium">{subject}</span> · {listing.offer.title}</Link></h2>
      <p className="teacher-card-price">{compactTutorRate(listing.offer.rate_paise)}<span>{listing.offer.rate_unit==='HOUR'?'/hr':`/lesson (${listing.offer.lesson_minutes} min)`}</span>{listing.offer.trial_kind==='FREE'&&<span className="teacher-card-trial"> · Free {listing.offer.trial_minutes}-min trial</span>}</p>
    </div>
  </article>;
}
