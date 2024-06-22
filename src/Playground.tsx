import {createSignal, createEffect, onMount, onCleanup, Accessor} from "solid-js";
import Chat from "./Chat";
import {Character, Message, Trait} from "./types.ts";
import {parseToken, parseErrorMsg, LLMToken} from "./utils"
import TextareaAutosize from "solid-textarea-autosize"
import "./styles/playground.css";
import runpodSdk from "runpod-sdk";

const runpod = runpodSdk(import.meta.env.VITE_RUNPOD_API_KEY);
const rundpodServerlessEndpoint = runpod.endpoint(import.meta.env.VITE_RUNPOD_ENDPOINT_ID);

type MessagesState = {[characterId: string]: Message[]}

const CONTROL_MESSAGES_KEY = "vibegpt_control_messages"
const BASELINE_MESSAGES_KEY = "vibegpt_baseline_messages"

function Playground({ playId, clearPlayground, character }: { playId: string, clearPlayground : (id: string) => void, character: Accessor<Character> }) {
  const [baselineMessage, setBaselineMessage] = createSignal<MessagesState>({ [character().id]: [] });
  const [controlMessage, setControlMessage] = createSignal<MessagesState>({ [character().id]: [] });
  const [prompt, setPrompt] = createSignal('')
  const [broke, setBroke] = createSignal(false)

    onMount(() => {
        [[CONTROL_MESSAGES_KEY, setControlMessage], [BASELINE_MESSAGES_KEY, setBaselineMessage]].forEach(([key, setter]) => {
            const localStorageMessages = JSON.parse(localStorage.getItem(`${key}_${character().name}`))
            const messages = {[character().id]: localStorageMessages || []}
            setter(messages)
        })
    });

    createEffect(() => {
        [[CONTROL_MESSAGES_KEY, controlMessage], [BASELINE_MESSAGES_KEY, baselineMessage]].forEach(([key, allMessages]) => {
            const messages: Message[] = allMessages()[character().id]
            if (messages && messages.length > 0) {
                localStorage.setItem(`${key}_${character().name}`, JSON.stringify(messages));
            }
    })});

  let textarea;
  const handleBeforeUnload = (event: any) => {
//    event.preventDefault();
 //   event.returnValue = ""; // Standard for most browsers
    handleResetPlayground()
    return "You have unsaved changes! Are you sure you want to leave?";
  };

  createEffect(()=>{
    console.log("CHARACTER CHANGE")
    console.log(character().name)
  })

  onMount(() => {
    window.addEventListener("beforeunload", handleBeforeUnload);
  });

  // Cleanup before component unmounts
  onCleanup(() => {
    window.removeEventListener("beforeunload", handleBeforeUnload);
  });

  const handleResetPlayground = () => {
    fetch(`${import.meta.env.VITE_ENDPOINT}/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            playId,
        }),
        }
    )
    setBaselineMessage({
      ...baselineMessage(),
      [character().id]: []
    })
    setControlMessage({
      ...controlMessage(),
      [character().id]: []
    })
    clearPlayground(crypto.randomUUID())
  }

  const addMessage = (role: string, content: string, traits: Trait[]) => {
    const msgToAdd : Message = {
        "role": role,
        "content": role == 'user' ? content : '',
        "tokens": [],
        traits
    }
    setBaselineMessage({
      ...baselineMessage(),
      [character().id]: !(character().id in baselineMessage()) ? [msgToAdd] : [...baselineMessage()[character().id], msgToAdd]
    })
    setControlMessage({
      ...controlMessage(),
      [character().id]: !(character().id in controlMessage()) ? [msgToAdd] : [...controlMessage()[character().id], msgToAdd]
    })
  }


  const handleSubmit = async (inputPrompt: string, event : any = null) => {
    var prompt = inputPrompt
    if (event) {
      event.preventDefault()
      prompt = event.target.value.trim()
      event.target.value = ''
    }
    textarea.style.height = '19px';
    setPrompt('')
    const traits : Trait[] = Object.values(character().traits)
    addMessage("user", prompt, traits)
    addMessage("assistant", "", traits)
    if (prompt != null) {
      try {
          console.log("endpoint is", rundpodServerlessEndpoint)

          async function updateLLMText(jobId, messages, setter) {
              for await (const chunk of rundpodServerlessEndpoint.stream(jobId)) {
                  const tokenObj = parseToken(chunk.output);
                  const msg = messages()[character().id]
                  if (tokenObj !== null) {
                      if (tokenObj.error) {
                          const errorMsg = {
                              role: "error",
                              content: parseErrorMsg(tokenObj.error),
                              tokens: [],
                              traits: []
                          }
                          setter({...messages(), [character().id]: [...msg.slice(0, -1), errorMsg]})
                          setBroke(true)
                          console.log(errorMsg)
                          return;
                      }
                      const newMsg: Message = {
                          role: "assistant",
                          content: "",
                          tokens: [...msg[msg.length - 1].tokens, {text: tokenObj.data, corrs: []}],
                          traits
                      }
                      setter({...messages(), [character().id]: [...msg.slice(0, -1), newMsg]})
                  }
              }
          }

          await Promise.all([
              ["control", controlMessage, setControlMessage],
              ["baseline", baselineMessage, setBaselineMessage],
          ].map(([chatType, messages, setter]) =>
              rundpodServerlessEndpoint.run({
                  input: {
                    playId,
                    prompt,
                    character: character(),
                    type: chatType,
                    history: messages()[character().id].map(({role, tokens, content}) => ({
                        text: (role == "assistant") ? tokens.map(({text}) => text).join("") : content,
                        role
                    })).slice(0, -1)
                  }
              }).then(({id}) => updateLLMText(id, messages, setter))
          ))
      } catch (error) {
        console.log("ERROR")
        console.error("Error streaming response:", error);
        const errorMsg = {
          role: "system",
          content: "Error",
          tokens: [],
          traits: []
        }
        setControlMessage({...controlMessage(), [character().id]: [...controlMessage()[character().id], errorMsg]})
        setBaselineMessage({...baselineMessage(), [character().id]: [...baselineMessage()[character().id], errorMsg]})
        setBroke(true)
      } finally {
      }
    }
  };

  const [leftShrunk, setLeftShrunk] = createSignal(false); // Add state for left Chat collapsed status
  const [rightShrunk, setRightShrunk] = createSignal(false); // Add state for right Chat collapsed status
  const [chatRef, setChatRef] = createSignal(null)

  //createEffect(() => {console.log(chatRef().getBoundingClientRect())})
  console.log(controlMessage())

  return (
    <div class="playground-container">
      <div class="header-container">
        <div class="header-title">Playground</div>
        <div class="header-model">
          Llama-3-8B-Instruct
        </div>
      </div>
      <div class="chats-container"  ref={setChatRef}>
        <Chat character={character} type={'control'} messages={controlMessage} onShrunk={(b)=>setRightShrunk(b)} setRef={setChatRef}/>
        <Chat character={character} type={'baseline'} messages={baselineMessage} onShrunk={(b)=>setLeftShrunk(b)} setRef={setChatRef}/>
      </div>
      <div class="message-send" style={{width: leftShrunk() && rightShrunk() ? `${chatRef().getBoundingClientRect().width*2-1.5}px` : null}}>
        <div class="message-send-container">
            <TextareaAutosize
              ref={textarea}
              value={prompt()}
              onChange={(event) => {
                setPrompt(event.target.value)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                    handleSubmit(prompt(), event=event);
                }
              }}
              minRows={1.05}
              maxRows={18}
              class="prompt-input"
              placeholder="Enter your message here"
              disabled={broke()}
            /> 
            <div class="send-button" onClick={()=>{handleSubmit(prompt())}}>
                <svg fill="#000000" height="800px" width="800px" version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 495.003 495.003" xml:space="preserve">
                    <g id="XMLID_51_">
                    <path id="XMLID_53_" d="M164.711,456.687c0,2.966,1.647,5.686,4.266,7.072c2.617,1.385,5.799,1.207,8.245-0.468l55.09-37.616 l-67.6-32.22V456.687z"/>
                    <path id="XMLID_52_" d="M492.431,32.443c-1.513-1.395-3.466-2.125-5.44-2.125c-1.19,0-2.377,0.264-3.5,0.816L7.905,264.422 c-4.861,2.389-7.937,7.353-7.904,12.783c0.033,5.423,3.161,10.353,8.057,12.689l125.342,59.724l250.62-205.99L164.455,364.414 l156.145,74.4c1.918,0.919,4.012,1.376,6.084,1.376c1.768,0,3.519-0.322,5.186-0.977c3.637-1.438,6.527-4.318,7.97-7.956 L494.436,41.257C495.66,38.188,494.862,34.679,492.431,32.443z"/>
                    </g>
                </svg>
            </div>
        </div>
    </div>
    </div>
  );
}

export default Playground;
