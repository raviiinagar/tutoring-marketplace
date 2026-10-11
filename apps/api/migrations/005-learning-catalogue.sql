CREATE TABLE learning_domains (
  id text PRIMARY KEY,
  label text NOT NULL UNIQUE,
  position integer NOT NULL UNIQUE
);
CREATE TABLE catalogue_terms (
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9-]{1,79}$'),
  kind text NOT NULL CHECK (kind IN ('SUBJECT','LEVEL','CURRICULUM','EXAM','LANGUAGE')),
  label text NOT NULL CHECK (length(label) BETWEEN 2 AND 100),
  aliases text[] NOT NULL DEFAULT '{}',
  domain_ids text[] NOT NULL CHECK (cardinality(domain_ids) BETWEEN 1 AND 8),
  active boolean NOT NULL DEFAULT true,
  UNIQUE (id,kind)
);
CREATE TABLE catalogue_names (
  kind text NOT NULL,
  name text NOT NULL CHECK (length(name)>0),
  term_id text NOT NULL,
  PRIMARY KEY(kind,name),
  FOREIGN KEY(term_id,kind) REFERENCES catalogue_terms(id,kind)
);
INSERT INTO learning_domains VALUES
('school','School education',1),('entrance','Entrance examinations',2),
('higher','Higher education',3),('competitive','Competitive examinations',4),
('professional','Professional qualifications',5),('career','Career skills',6),
('languages','Languages and communication',7),('arts','Arts and other learning',8);

INSERT INTO catalogue_terms(id,kind,label,aliases,domain_ids) VALUES
('subject-mathematics','SUBJECT','Mathematics',ARRAY['Maths','Math'],ARRAY['school','entrance','higher','competitive']),
('subject-physics','SUBJECT','Physics','{}',ARRAY['school','entrance','higher']),
('subject-chemistry','SUBJECT','Chemistry','{}',ARRAY['school','entrance','higher']),
('subject-biology','SUBJECT','Biology','{}',ARRAY['school','entrance','higher']),
('subject-science','SUBJECT','Science','{}',ARRAY['school']),
('subject-english','SUBJECT','English',ARRAY['English language'],ARRAY['school','languages','competitive']),
('subject-hindi','SUBJECT','Hindi','{}',ARRAY['school','languages']),
('subject-history','SUBJECT','History','{}',ARRAY['school','higher','competitive']),
('subject-engineering','SUBJECT','Engineering fundamentals','{}',ARRAY['higher']),
('subject-medicine','SUBJECT','Medical sciences','{}',ARRAY['higher']),
('subject-commerce','SUBJECT','Commerce','{}',ARRAY['school','higher','professional']),
('subject-accounting','SUBJECT','Accounting',ARRAY['Accountancy'],ARRAY['school','higher','professional','career']),
('subject-general-studies','SUBJECT','General studies','{}',ARRAY['competitive']),
('subject-reasoning','SUBJECT','Reasoning','{}',ARRAY['competitive']),
('subject-aptitude','SUBJECT','Quantitative aptitude','{}',ARRAY['competitive']),
('subject-taxation','SUBJECT','Taxation','{}',ARRAY['professional']),
('subject-law','SUBJECT','Business law','{}',ARRAY['professional','higher']),
('subject-programming','SUBJECT','Programming',ARRAY['Coding'],ARRAY['career','higher']),
('subject-data-science','SUBJECT','Data science','{}',ARRAY['career','higher']),
('subject-ai','SUBJECT','Artificial intelligence',ARRAY['AI'],ARRAY['career','higher']),
('subject-design','SUBJECT','Design','{}',ARRAY['career','arts']),
('subject-french','SUBJECT','French','{}',ARRAY['languages']),
('subject-interviews','SUBJECT','Interview preparation','{}',ARRAY['languages','career']),
('subject-music','SUBJECT','Music','{}',ARRAY['arts']),
('subject-drawing','SUBJECT','Drawing',ARRAY['Sketching'],ARRAY['arts']),
('curriculum-cbse','CURRICULUM','CBSE',ARRAY['Central Board of Secondary Education'],ARRAY['school']),
('curriculum-icse','CURRICULUM','ICSE',ARRAY['CISCE ICSE'],ARRAY['school']),
('curriculum-isc','CURRICULUM','ISC',ARRAY['CISCE ISC'],ARRAY['school']),
('curriculum-state-board','CURRICULUM','State-board curricula',ARRAY['State board'],ARRAY['school']),
('exam-jee','EXAM','JEE',ARRAY['IIT JEE','Joint Entrance Examination'],ARRAY['entrance']),
('exam-jee-main','EXAM','JEE Main',ARRAY['JEE Mains'],ARRAY['entrance']),
('exam-jee-advanced','EXAM','JEE Advanced',ARRAY['IIT JEE Advanced'],ARRAY['entrance']),
('exam-neet','EXAM','NEET',ARRAY['NEET UG'],ARRAY['entrance']),
('exam-cuet','EXAM','CUET',ARRAY['CUET UG'],ARRAY['entrance']),
('exam-upsc','EXAM','UPSC',ARRAY['UPSC Civil Services'],ARRAY['competitive']),
('exam-ssc','EXAM','SSC','{}',ARRAY['competitive']),
('exam-banking','EXAM','Banking examinations',ARRAY['Bank exams'],ARRAY['competitive']),
('exam-railway','EXAM','Railway examinations',ARRAY['RRB'],ARRAY['competitive']),
('exam-state-services','EXAM','State service examinations',ARRAY['State PSC'],ARRAY['competitive']),
('exam-ca','EXAM','CA',ARRAY['Chartered Accountancy'],ARRAY['professional']),
('exam-cs','EXAM','CS',ARRAY['Company Secretary'],ARRAY['professional']),
('exam-cma','EXAM','CMA',ARRAY['Cost and Management Accountancy'],ARRAY['professional']),
('level-primary','LEVEL','Primary school','{}',ARRAY['school']),
('level-middle','LEVEL','Middle school','{}',ARRAY['school']),
('level-class-9','LEVEL','Class 9',ARRAY['Grade 9'],ARRAY['school']),
('level-class-10','LEVEL','Class 10',ARRAY['Grade 10'],ARRAY['school']),
('level-class-11','LEVEL','Class 11',ARRAY['Grade 11'],ARRAY['school','entrance']),
('level-class-12','LEVEL','Class 12',ARRAY['Grade 12'],ARRAY['school','entrance']),
('level-repeater','LEVEL','Entrance exam repeater',ARRAY['Dropper'],ARRAY['entrance']),
('level-undergraduate','LEVEL','Undergraduate','{}',ARRAY['higher']),
('level-postgraduate','LEVEL','Postgraduate','{}',ARRAY['higher']),
('level-exam-preparation','LEVEL','Exam preparation','{}',ARRAY['competitive','professional']),
('level-beginner','LEVEL','Beginner','{}',ARRAY['career','languages','arts']),
('level-intermediate','LEVEL','Intermediate','{}',ARRAY['career','languages','arts']),
('level-advanced','LEVEL','Advanced','{}',ARRAY['career','languages','arts']);

INSERT INTO catalogue_terms(id,kind,label,domain_ids)
SELECT id,'LANGUAGE',label,ARRAY['school','entrance','higher','competitive','professional','career','languages','arts']
FROM (VALUES ('language-english','English'),('language-hindi','Hindi'),('language-bengali','Bengali'),('language-tamil','Tamil'),('language-telugu','Telugu'),('language-marathi','Marathi'),('language-kannada','Kannada'),('language-gujarati','Gujarati'),('language-malayalam','Malayalam'),('language-punjabi','Punjabi')) AS languages(id,label);

-- Seed labels are ASCII; the service also supports Unicode-normalized staff terms.
INSERT INTO catalogue_names(kind,name,term_id)
SELECT kind,regexp_replace(lower(name),'[^a-z0-9]','','g'),id
FROM catalogue_terms CROSS JOIN LATERAL unnest(array_prepend(label,aliases)) AS names(name);
