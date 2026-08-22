
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Check if user already exists
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'immocongo@idriss.com';

  IF v_user_id IS NULL THEN
    -- Insert into auth.users directly via service role
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      'immocongo@idriss.com',
      crypt('Idmozice@1996', gen_salt('bf', 12)),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"username":"immocongo","role":"admin"}',
      'authenticated',
      'authenticated',
      now(),
      now(),
      '',
      '',
      '',
      ''
    )
    RETURNING id INTO v_user_id;
  ELSE
    -- Update password if user exists
    UPDATE auth.users
    SET encrypted_password = crypt('Idmozice@1996', gen_salt('bf', 12)),
        email_confirmed_at = now(),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  -- Upsert profile as admin
  INSERT INTO public.profiles (id, username, email, role, is_active, created_at, updated_at)
  VALUES (v_user_id, 'immocongo', 'immocongo@idriss.com', 'admin', true, now(), now())
  ON CONFLICT (id) DO UPDATE SET
    role = 'admin',
    is_active = true,
    username = 'immocongo',
    email = 'immocongo@idriss.com',
    updated_at = now();

END $$;
