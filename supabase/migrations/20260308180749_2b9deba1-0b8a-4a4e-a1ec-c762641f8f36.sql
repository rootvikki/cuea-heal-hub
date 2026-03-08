
-- Delete all auth users except the super_admin
DELETE FROM auth.users WHERE id IN (
  'db1f23ab-28f4-4763-a667-ac5adc3b8334',
  'fcc745b9-1204-4bb8-9260-1455bfb4d888',
  'cb1df8a5-9416-454f-af71-d47c15b7c07c',
  'a9514767-becc-42a8-9843-28585f8eb7ac',
  '181bc941-f461-49bc-b36b-b075de8fa98e',
  '754d80d7-e1a4-46a8-9715-9ab1e0360f4d',
  '20d3c988-df0a-41e7-ac9f-8f70bd034b88',
  '25d4e667-5e83-4286-9015-d23fb283cffe',
  '1a76ef47-4ac7-4381-a8e2-27cfd2631434'
);
