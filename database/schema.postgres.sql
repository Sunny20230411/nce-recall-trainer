-- NCE Recall Trainer content and learning data model.
-- PostgreSQL 15+. Content tables are independent from user-learning tables.

create extension if not exists pgcrypto;

create table course_series (
  id text primary key,
  title text not null,
  description text not null default '',
  language_code text not null default 'en',
  translation_language_code text not null default 'zh-CN',
  source_name text,
  source_license text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table course_revisions (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references course_series(id) on delete cascade,
  revision integer not null check (revision > 0),
  schema_version text not null,
  generator_version text,
  stage text not null check (stage in ('raw', 'enriched', 'approved')),
  is_published boolean not null default false,
  generated_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (course_id, revision)
);

create unique index one_published_revision_per_course
  on course_revisions(course_id) where is_published;

create table lessons (
  id text primary key,
  course_revision_id uuid not null references course_revisions(id) on delete cascade,
  lesson_no integer not null check (lesson_no > 0),
  lesson_order integer not null check (lesson_order > 0),
  title text not null,
  source_text text not null,
  created_at timestamptz not null default now(),
  unique (course_revision_id, lesson_no),
  unique (course_revision_id, lesson_order)
);

create table sentences (
  id text primary key,
  lesson_id text not null references lessons(id) on delete cascade,
  sentence_order integer not null check (sentence_order > 0),
  source_paragraph_order integer not null check (source_paragraph_order > 0),
  source_sentence_order integer not null check (source_sentence_order > 0),
  english_text text not null,
  chinese_text text,
  translation_status text not null default 'pending'
    check (translation_status in ('pending', 'generated', 'reviewed', 'approved')),
  accepted_answers jsonb not null default '[]'::jsonb,
  audio_url text,
  difficulty smallint check (difficulty between 1 and 5),
  analysis_source text not null default 'pending'
    check (analysis_source in ('pending', 'rule', 'ai', 'human')),
  analysis_status text not null default 'pending'
    check (analysis_status in ('pending', 'generated', 'reviewed', 'approved')),
  analysis_rule_version text,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_id, sentence_order)
);

create table sentence_tokens (
  id text primary key,
  sentence_id text not null references sentences(id) on delete cascade,
  token_index integer not null check (token_index >= 0),
  display_text text not null,
  normalized_text text not null,
  punctuation text not null default '',
  phonetic text,
  pos_code text check (pos_code in (
    'noun', 'pronoun', 'verb', 'adjective', 'adverb', 'preposition',
    'conjunction', 'determiner', 'numeral', 'interjection', 'particle'
  )),
  pos_label text,
  context_meaning text,
  unique (sentence_id, token_index)
);

create table sentence_analysis_groups (
  id text primary key,
  sentence_id text not null references sentences(id) on delete cascade,
  group_type text not null,
  label text,
  start_token integer not null check (start_token >= 0),
  end_token integer not null check (end_token >= start_token),
  parent_group_id text references sentence_analysis_groups(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index sentence_analysis_groups_sentence_idx
  on sentence_analysis_groups(sentence_id, start_token, end_token);

create table sentence_hints (
  sentence_id text primary key references sentences(id) on delete cascade,
  memory_note text,
  letter_shape text,
  answer_note text,
  generated_by text,
  reviewed_at timestamptz
);

create table content_import_jobs (
  id uuid primary key default gen_random_uuid(),
  course_id text references course_series(id) on delete set null,
  source_filename text,
  source_checksum text,
  status text not null check (status in ('queued', 'processing', 'needs_review', 'completed', 'failed')),
  generator_version text,
  validation_report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Authentication can be supplied by an external provider. Do not store passwords here.
create table learner_profiles (
  id uuid primary key,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table practice_sessions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learner_profiles(id) on delete cascade,
  course_revision_id uuid not null references course_revisions(id),
  lesson_id text not null references lessons(id),
  mode text not null default 'full_lesson'
    check (mode in ('full_lesson', 'wrong_sentences')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0)
);

create table answer_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references practice_sessions(id) on delete cascade,
  sentence_id text not null references sentences(id),
  attempt_no integer not null check (attempt_no > 0),
  submitted_tokens jsonb not null,
  wrong_token_indexes jsonb not null default '[]'::jsonb,
  is_correct boolean not null,
  used_hint boolean not null default false,
  viewed_answer boolean not null default false,
  elapsed_ms integer not null default 0 check (elapsed_ms >= 0),
  created_at timestamptz not null default now(),
  unique (session_id, sentence_id, attempt_no)
);

create table sentence_mastery (
  learner_id uuid not null references learner_profiles(id) on delete cascade,
  sentence_id text not null references sentences(id) on delete cascade,
  first_try_correct_count integer not null default 0,
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  hint_count integer not null default 0,
  answer_view_count integer not null default 0,
  mastery_score numeric(5,2) not null default 0,
  last_practiced_at timestamptz,
  next_review_at timestamptz,
  primary key (learner_id, sentence_id)
);

create table lesson_progress (
  learner_id uuid not null references learner_profiles(id) on delete cascade,
  lesson_id text not null references lessons(id) on delete cascade,
  completed_sentence_count integer not null default 0,
  total_sentence_count integer not null default 0,
  correct_rate numeric(5,2) not null default 0,
  last_sentence_order integer not null default 1,
  last_practiced_at timestamptz,
  completed_at timestamptz,
  primary key (learner_id, lesson_id)
);
