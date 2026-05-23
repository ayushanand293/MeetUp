# ARCHIVED - 2026-05-23

This document is preserved for historical context. Current interviewer/deployment docs live in README.md, docs/INTERVIEWER_QUICKSTART.md, docs/ops_predeploy.md, docs/demo_script.md, and docs/interview_story.md.

---

# MeetUp Mobile App Flow

This document outlines the technical user journey and screen-to-screen navigation flow within the MeetUp mobile application.

## 1. Initialization & Authentication Flow
- **Loading Screen (`AnimatedLaunchScreen` / AppNavigator Loading):**
  - Checks if the user's authentication session is ready.
  - Determines if the user is a new user (no session) or a returning user (active session + completed profile).

- **Authentication Stack (`AuthStack`):**
  - **`RegisterScreen` (Default for New Users):**
    - State 1: Enter Phone Number -> Request OTP.
    - State 2: Enter OTP -> Verify Phone.
    - State 3: Enter Display Name -> Save Profile -> Route to `MainStack`.
  - **`LoginScreen` (For Existing Users):**
    - Enter Phone Number -> Request OTP.
    - Enter OTP -> Verify -> Route to `MainStack`.

## 2. Main Application Flow (`MainStack`)
Once authenticated and the profile is complete, the user enters the Main Stack.

- **`HomeScreen` (Central Hub):**
  - **Data Fetched:** Active sessions, pending incoming/outgoing requests, and meetup history.
  - **Dynamic Elements:** 
    - If an active session exists -> Displays "LIVE" Active Session Card.
    - If pending requests exist -> Displays pending timers/notifications.
  - **Navigation Routes from Home:**
    - -> `SettingsScreen`: Via the top-right settings icon.
    - -> `ActiveSessionScreen`: Via the Active Session banner (if a live meetup is active).
    - -> `QuickFriendsScreen`: Via the "Quick Friends" action or timeline header.
    - -> `FriendListScreen`: Via the "Find a Friend" action or CTA in the timeline.
    - -> `RequestsTabsScreen`: Via the "Your Requests" action or incoming request notification banner.

## 3. Meetup Request Flow
- **Sending a Request:**
  - User navigates to `FriendListScreen` or `QuickFriendsScreen`.
  - User initiates a request.
  - Flow returns to `HomeScreen`, where the request appears under "Pending Requests" with a countdown timer.
- **Receiving a Request:**
  - Incoming request appears on the `HomeScreen`.
  - User taps the notification -> Routes to `RequestsTabsScreen` (Incoming Tab).
  - User can Accept or Decline.
- **Accepting a Request (`AcceptRequestScreen`):**
  - Processing the acceptance.
  - Automatically transitions both the sender and the receiver into the `ActiveSessionScreen`.

## 4. Active Session Flow
- **`ActiveSessionScreen`:**
  - Triggered automatically when a pending request is mutually accepted, or manually via the "LIVE" banner on the Home screen.
  - **Features:** Real-time map, location tracking, and routing to meet at a common geographical point.
  - **Exit:** Ending the session or leaving the screen returns the user to the `HomeScreen`, and the completed session is added to "Your Meetup Story" history.
