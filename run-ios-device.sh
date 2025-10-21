#!/bin/bash

# List connected physical devices
echo "Connected Physical iOS Devices:"
devices=$(xcrun xctrace list devices | grep -v Simulator | grep -v '== Devices ==' | grep -v 'Unavailable')
echo "$devices" | nl

# Prompt user to select one
read -p "Enter the number of the device you want to use: " selection
# Extract the selected line
selected_line=$(echo "$devices" | sed -n "${selection}p")

# Extract UDID and name
udid=$(echo "$selected_line" | sed -E 's/.*\(([A-F0-9-]+)\).*/\1/')
name=$(echo "$selected_line" | sed -E 's/^(.*) \(.*/\1/' | xargs)

echo "Selected device: $name ($udid)"

# Run the app on the selected device
npx react-native run-ios --udid "$udid"