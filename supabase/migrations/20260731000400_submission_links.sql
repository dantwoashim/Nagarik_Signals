begin;

alter table nagarik.issues
  add column source_submission_id uuid unique
  references nagarik.submissions(id);

commit;
