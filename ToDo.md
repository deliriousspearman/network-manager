# ToDo

## Overview

## Devices

- FEATURE: Add a diff option to compare 2 captured time's
- FEATURE: Add search bar
- FEATURE: Add folder tree
- FEATURE: Add tree view for process listing
- FEATURE: Import & Export
- FEATURE: Add an option to import a .txt file, it should scroll through for output from the text file that matches parsed fields and confirm if the user wants to add them.
- FEATURE: Add option to submit commands instead of submit and parse incase its not compatiable

## Network Diagram

- Add an option to select the default style for different device types
- DESIGN: Checkbox to display VLAN ID
- FEATURE: Add an option to export and import the network diagram
- ISSUE: Only the primary or first IP displays in the list
- DESIGN: Hide option for the overall view box?
- DESIGN: Add opacheness to subnet background colour
- DESIGN: Show zoom percentage
- DESIGN: Add Animated edge (ref: https://reactflow.dev/examples/edges/animating-edges)
- DESIGN: Add Delete Edge on Drop (ref: https://reactflow.dev/examples/edges/delete-edge-on-drop)
- DESIGN: Styles for Edge label
- DESIGN: Look into Floating Edges (ref: https://reactflow.dev/examples/edges/floating-edges)
- DESIGN: Look into markers / arrows (ref: https://reactflow.dev/examples/edges/markers)
- DESIGN: Add icons for Hosts
- DESIGN: Only show connecter joints when drawing out an edge
- For the network diagram lets change the colour selection boxes for connections, devices and subnets. Instead of having a circle of preselected colours have a more flexable popup window to select a colour, and when hovering over the selection box show the hex value of the colour as a tooltip.

## Credentials

- FEATURE: Add a search filter similar to a conlfluence filter search bar on a table


# Logs

- Change logs to only show logs related to a project
- Add admin logs for non project related
- FEATURE: Filter timestamp times (Since: <datetime>, Until: <datetime>) similar to proxmox System Log

## Overall

- FEATURE: Add Ports option, import nmap output
- FEATURE: Overview Window (includes fields like short written overview of the project, number of hosts, number that have acces to - refer to pentest.ws/neuron.ws for example)
- FEATURE: Have linked boxes, incase 1 host is in multiple subnets
- FEATURE: Add a search bar / button at the top of the navigation bar that searches site wide. When you press to type it should open up a popup / modul for searching
- FEATURE: search bar to search on:
	- hosts with the same user
	- hosts with a certain process
- FEATURE: Change output for a host to be text with an optional parse button
- FEATURE: Add a new diagram for network connections to represent what systems can talk to one another (include port status)
- DESIGN: Add option for a picture left of the title
- FEATURE: Integreate LDAP authentication
- FEATURE: Add groups and roles (User Bob part of Team A, edit perms. User Bob can view Team B)
- FEATURE: PCAP Viewer?
- DESIGN: Add loading logo
- FEATURE: Add GraphQL (Neo4J)
- FEATURE: Upload pictures to use for icons
- FEATURE: Change the backup option to export each section as different json files and store in a zip. This way inidividual options can be imported
- If youre not logged in as an admin
- FEATURE: Image database
- FEATURE: Add user accounts (mainly for admin)
	- If youre not an admin then dont display the admin options
- ctrl+z to undo action on network diagram
Pentest Ideas:
- FEATURE: Toggle icons for interested, not interests
- Add attachments
- Add pcap view
- Something in the Network Diagram to tie a VM to its Hypervsior (either something in the diaram or in the details pane) Lets overall some of the options in the network diagram, lets add:
- change url to include project name/slug instead of /p/
- Add import from nmap script (xml?)
- Either change parsing for ps or support multiple, add to the input placeholder text what it supports
- Change the project selection dropdown
- Fix network diagram edges not reconnecting
- I want to add user authentication, there should be roles for users and admins. Only admins should be able to see the 'Admin Settings. Also add support for authenticating with GitLab account.

## Still Deciding

- Add Bookmarks menu
- Change database from sqlite3 to maria
- Create a graphical timeline of events

## Bugs/Changes/Checks

- CHECK: Check what on the network diagram is stored in the localDatabase and change whats needed

# Prompts

## Initial



## Features



## Security

“Analyze our app carefully, being aware of context, dependencies, and functionality. Pay especially close attention to vulnerable areas such as user-input fields and API calls (especially mutations). Identify security concerns as well as suggestions for how to solve for these security concerns.” 

## Performance/Abstraction

“Walk through our application and, with attention to context and dependencies, read every function, event, and component. Identify both areas where abstraction might be possible to reduce code duplication and where refactoring can be done to improve performance. Look especially for opportunities to cache results, reduce unnecessary re-renders, and other easy wins.” 

## Clean-up

“Let’s look at all of our code and follow all of our components, functions, and events. Find code that is no-longer used due to refactors, or code that might be included in an import statement, but not actually used where it is imported. Identify all abandoned code and unused imports. Show them to me so that I can verify that the code is unused and no longer needed.”

### References

- https://base44.com/blog/prompts-for-vibe-coding
- https://seroter.com/2025/07/07/quality-focused-prompts-for-the-vibe-coding-addict/