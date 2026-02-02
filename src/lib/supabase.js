import { createClient } from '@supabase/supabase-js'
const supabaseUrl = 'https://hiqhzgqudmhaqqfiitrn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpcWh6Z3F1ZG1oYXFxZmlpdHJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMjIwNjYsImV4cCI6MjA4NTU5ODA2Nn0.DVfVuQjxegnkHq00d8VRCDr0ifGTTaYXmvY12xIF6Ro'
export const supabase = createClient(supabaseUrl, supabaseKey)