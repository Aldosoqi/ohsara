-- Add preference columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN language_preference TEXT DEFAULT 'american-english',
ADD COLUMN response_language_preference TEXT DEFAULT 'automatic',
ADD COLUMN appearance_preference TEXT DEFAULT 'system';