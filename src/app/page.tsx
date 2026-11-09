import { redirect } from "next/navigation";

// Home handles both: signed out, it is the pitch and the sign-in; signed in,
// it is search and what everyone is listening to.
export default function Page() {
  redirect("/home");
}
