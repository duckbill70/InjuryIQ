#!/bin/bash

# List available simulators
echo "Available iOS Simulators:"
simulators=$(xcrun simctl list devices | grep -E 'iPhone|iPad' | grep -v unavailable | grep -v 'Watch' | grep -v 'Apple TV' | grep -v 'Mac')
echo "$simulators" | nl

# Prompt user to select one
read -p "Enter the number of the simulator you want to use: " selection

# Extract the selected line
selected_line=$(echo "$simulators" | sed -n "${selection}p")

# Extract UDID and name
udid=$(echo "$selected_line" | sed -E 's/.*\(([A-F0-9-]+)\).*/\1/')
name=$(echo "$selected_line" | sed -E 's/^(.*) \(.*/\1/' | xargs)

# Check if simulator is already booted
booted=$(xcrun simctl list devices | grep "$udid" | grep "Booted")

if [ -z "$booted" ]; then
  echo "Booting simulator: $name ($udid)"
  open -a Simulator --args -CurrentDeviceUDID "$udid"
  sleep 5  # Give it a moment to boot
else
  echo "Simulator already booted: $name"
fi

# Run the app on the selected simulator
echo "Launching app on simulator with UDID: $udid"
npx react-native run-ios --udid "$udid"