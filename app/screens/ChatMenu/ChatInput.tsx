import { MaterialIcons } from '@expo/vector-icons'
import { AppSettings } from '@lib/constants/GlobalValues'
import { generateResponse } from '@lib/engine/Inference'
import { Characters } from '@lib/state/Characters'
import { Chats, useInference } from '@lib/state/Chat'
import { Logger } from '@lib/state/Logger'
import { Theme } from '@lib/theme/ThemeManager'
import React, { useState, useRef } from 'react'
import {
    TextInput, TouchableOpacity, View,
    Pressable, Text, Image, StyleSheet,
    Alert, PanResponder
} from 'react-native'
import { useMMKVBoolean } from 'react-native-mmkv'
import { useShallow } from 'zustand/react/shallow'
import * as ImagePicker from 'expo-image-picker';
import { captureRef } from 'react-native-view-shot';
import Svg, { Path } from 'react-native-svg';

const CANVAS_SIZE = 300;

const ChatInput = () => {
    const [newMessage, setNewMessage] = useState('');
    const [images, setImages] = useState([]);
    const [showCanvas, setShowCanvas] = useState(false);
    const [paths, setPaths] = useState([]);
    const { color, borderRadius, spacing } = Theme.useTheme()
    const [sendOnEnter, setSendOnEnter] = useMMKVBoolean(AppSettings.SendOnEnter)

    const drawingRef = useRef();
    const canvasRef = useRef(null);

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            flexDirection: 'column',  // Ensure elements are stacked vertically
            alignItems: 'flex-start', // Align all elements to the left
            padding: 16,
        },
        thumbnailWrapper: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'flex-start',  // Align thumbnails to the left
            marginBottom: 12,
            width: '100%',
        },
        thumbnailContainer: {
            position: 'relative',
            marginRight: 8,
            marginBottom: 8,
        },
        thumbnail: {
            width: 80,
            height: 80,
            borderRadius: 8,
        },
        removeButton: {
            position: 'absolute',
            top: -6,
            right: -6,
            backgroundColor: '#ff3b30',
            borderRadius: 12,
            width: 20,
            height: 20,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1,
        },
        removeButtonText: {
            color: 'white',
            fontSize: 12,
            lineHeight: 12,
        },
        inputRow: {
            flexDirection: 'row',
            alignItems: 'center',
            width: '100%',  // Ensure the input row takes up full width
        },
        button: {
            backgroundColor: color.primary._500,
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 6,
            marginRight: 4,
        },
        buttonText: {
            color: '#fff',
            fontSize: 16,
        },
        input: {
            flex: 1,
            borderColor: '#ccc',
            borderWidth: 1,
            borderRadius: 6,
            paddingHorizontal: 10,
            paddingVertical: 8,
        },

        overlay: {
            position: 'absolute',
            top: -CANVAS_SIZE * 2, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.3)',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 100,
        },
        canvasWrapper: {
            backgroundColor: '#fff',
            borderRadius: 12,
            padding: 12,
            alignItems: 'center',
            elevation: 10,
        },
        canvas: {
            width: CANVAS_SIZE,
            height: CANVAS_SIZE,
            backgroundColor: '#f2f2f2',
            borderRadius: 8,
            overflow: 'hidden',
        },
        canvasControls: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: 12,
        },
        canvasButton: {
            backgroundColor: '#007AFF',
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 6,
            marginHorizontal: 4,
        },
        canvasButtonText: {
            color: '#fff',
            fontSize: 14,
        },
    });

    const addImages = (uris) => {
        const newImages = uris.map((uri) => ({
            id: `${uri}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            uri,
        }));
        setImages((prev) => [...prev, ...newImages]);
        Logger.info(uris);
    };

    const handleAttachImage = async () => {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permissionResult.granted) {
            Alert.alert("Permission required", "Permission to access media library is needed.");
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: 'images',
            allowsMultipleSelection: true,
            quality: 0.5,
        });

        if (!result.canceled) {
            addImages(result.assets.map((a) => a.uri));
        }
    };

    const handleRemoveImage = (idToRemove) => {
        setImages((prev) => prev.filter((img) => img.id !== idToRemove));
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderGrant: (e) => {
                const x = e.nativeEvent.locationX;
                const y = e.nativeEvent.locationY;
                setPaths((prev) => [...prev, `M ${x} ${y}`]);
            },
            onPanResponderMove: (e) => {
                const x = e.nativeEvent.locationX;
                const y = e.nativeEvent.locationY;
                setPaths((prev) => {
                    const last = prev[prev.length - 1] + ` L ${x} ${y}`;
                    return [...prev.slice(0, -1), last];
                });
            },
        })
    ).current;

    const saveDrawing = async () => {
        try {
            const uri = await captureRef(drawingRef, {
                format: 'png',
                quality: 0.8,
            });
            addImages([uri]);
            setPaths([]);
            setShowCanvas(false);
        } catch (err) {
            Alert.alert("Error", "Failed to save drawing.");
            console.error(err);
        }
    };

    const { addEntry } = Chats.useEntry()

    const { nowGenerating, abortFunction } = useInference((state) => ({
        nowGenerating: state.nowGenerating,
        abortFunction: state.abortFunction,
    }))

    const { charName } = Characters.useCharacterCard(
        useShallow((state) => ({
            charName: state?.card?.name,
        }))
    )

    const { userName } = Characters.useUserCard(
        useShallow((state) => ({ userName: state.card?.name }))
    )

    const abortResponse = async () => {
        Logger.info(`Aborting Generation`)
        if (abortFunction) await abortFunction()
    }

    const handleSend = async () => {
        if (newMessage.trim() !== '') await addEntry(userName ?? '', true, newMessage)
        const swipeId = await addEntry(charName ?? '', false, '')
        setNewMessage((message) => '')
        if (swipeId) generateResponse(swipeId)
    }

    return (
        <View style={styles.container}>
            {/* Thumbnail area */}
            <View style={styles.thumbnailWrapper}>
                {images.map((img) => (
                    <View key={img.id} style={styles.thumbnailContainer}>
                        <Image source={{ uri: img.uri }} style={styles.thumbnail} />
                        <Pressable style={styles.removeButton} onPress={() => handleRemoveImage(img.id)}>
                            <Text style={styles.removeButtonText}>✕</Text>
                        </Pressable>
                    </View>
                ))}
            </View>

            {/* Text Input and buttons area */}
            <View style={styles.inputRow}>
                <Pressable onPress={handleAttachImage} style={styles.button}>
                    <Text style={styles.buttonText}>📎</Text>
                </Pressable>

                <Pressable onPress={() => setShowCanvas(true)} style={styles.button}>
                    <Text style={styles.buttonText}>🖌️</Text>
                </Pressable>

                <TextInput
                    style={{
                        color: color.text._100,
                        backgroundColor: color.neutral._100,
                        flex: 1,
                        borderWidth: 2,
                        borderColor: color.primary._300,
                        borderRadius: borderRadius.l,
                        paddingHorizontal: spacing.xl,
                        paddingVertical: spacing.m,
                        marginHorizontal: spacing.m,
                    }}
                    placeholder="Message..."
                    placeholderTextColor={color.text._700}
                    value={newMessage}
                    onChangeText={setNewMessage}
                    multiline
                    submitBehavior={sendOnEnter ? 'blurAndSubmit' : 'newline'}
                    onSubmitEditing={sendOnEnter ? handleSend : undefined}
                />
                {nowGenerating ? (
                    <TouchableOpacity
                        style={{
                            borderRadius: borderRadius.m,
                            backgroundColor: color.error._500,
                            padding: spacing.m,
                        }}
                        onPress={abortResponse}>
                        <MaterialIcons name="stop" color={color.neutral._100} size={24} />
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        style={{
                            borderRadius: borderRadius.m,
                            backgroundColor: color.primary._500,
                            padding: spacing.m,
                        }}
                        onPress={handleSend}>
                        <MaterialIcons name="send" color={color.neutral._100} size={24} />
                    </TouchableOpacity>
                )}
            </View>

            {/* Canvas drawing modal */}
            {showCanvas && (
                <View style={styles.overlay}>
                    <View style={styles.canvasWrapper}>
                        <View
                            style={styles.canvas}
                            ref={(ref) => {
                                drawingRef.current = ref;
                                canvasRef.current = ref;
                            }}
                            {...panResponder.panHandlers}
                        >
                            <Svg height="100%" width="100%">
                                {paths.map((d, i) => (
                                    <Path key={i} d={d} stroke="black" strokeWidth={3} fill="none" />
                                ))}
                            </Svg>
                        </View>
                        <View style={styles.canvasControls}>
                            <Pressable onPress={() => setPaths([])} style={styles.canvasButton}>
                                <Text style={styles.canvasButtonText}>Clear</Text>
                            </Pressable>
                            <Pressable onPress={saveDrawing} style={styles.canvasButton}>
                                <Text style={styles.canvasButtonText}>Save</Text>
                            </Pressable>
                            <Pressable onPress={() => setShowCanvas(false)} style={styles.canvasButton}>
                                <Text style={styles.canvasButtonText}>Cancel</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            )}
        </View>
    )
}

export default ChatInput
