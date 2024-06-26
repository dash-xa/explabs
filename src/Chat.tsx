import { Token, Trait } from "./types";
import "./styles/playground.css";
import { createEffect, createSignal, onMount, onCleanup } from "solid-js";
import { SolidMarkdown } from "solid-markdown";
import { Highlight, Language } from "solid-highlight";
import ResizeInIcon from "./assets/resize-in.svg";
import ResizeOutIcon from "./assets/resize-out.svg";

// TODO: allow code syntax highlighting
// https://github.com/aidanaden/solid-highlight?tab=readme-ov-file
function wrap() {

}

function constructMessage(tokens: Token[]): string {
    return tokens.map(token => token.text).join('');
}

function traitsTag(traits: Trait[]) {
    return (
        <div class="ctrls-tag">
            {traits.filter(trait => trait.coeff > 0).map(trait => (
                <div class="tag">
                    <div class="tag-name">
                        <svg class="tag-color" viewBox="0 0 100 100" width="1em" height="1em">
                            <circle cx="40" cy="40" r="40" fill={trait.color} />
                        </svg>
                        {trait.desc}
                        {trait.name}
                    </div>
                    <div class="tag-coeff">{Math.floor(Math.min(Math.max(0, trait.coeff), 1) * 100)}%</div>
                </div>
            ))}
        </div>
    )
}

function Chat({ character, type, messages, onShrunk, setRef }) {
    const [autoScroll, setAutoScroll] = createSignal(true);
    const [chatInnerRef, setChatInnerRef] = createSignal(null)
    const [chatOuterRef, setChatOuterRef] = createSignal(null)
    let msgRef;

    const handleScroll = () => {
        if (messages()[character().id].length == 0) return;
        const chatContainer = chatInnerRef();
        if (chatContainer) {
            const isScrolledToBottom =
                chatContainer.scrollHeight - chatContainer.clientHeight <=
                chatContainer.scrollTop + parseInt(getComputedStyle(msgRef).fontSize);
            //  console.log(chatContainer.scrollHeight, chatContainer.clientHeight, chatContainer.scrollTop,  parseInt(getComputedStyle(msgRef).fontSize), isScrolledToBottom)
            if (isScrolledToBottom  != autoScroll()) setAutoScroll(isScrolledToBottom);
        }
    };

    createEffect(() => {
        messages()[character().id]
        if (autoScroll()) {
            chatInnerRef().scrollTo({ top: chatInnerRef().scrollHeight, behavior: 'smooth' });
        }
    });

    createEffect(()=>{
        shrink()
        console.log(chatOuterRef())
        setRef(chatOuterRef())
    })

    const [shrink, setShrink] = createSignal(false)
    return (
     <div class={type === 'baseline' ? 'chat-baseline' : 'chat-control'} 
     style={{ 'width': shrink() ? '5%': '100%'}}
     ref={setChatOuterRef}
     >
        <div class="chat-header">
            { type=='baseline' && <div class="chat-collapse" onClick={()=>{
                onShrunk(shrink() ? false : true)
                setShrink(shrink() ? false : true)}
                }>
                <div class="chat-collapse-tag">{shrink() ? <img src={ResizeOutIcon} alt="expand"/> : <img src={ResizeInIcon} alt="shrink"/>}</div>
            </div>
            }
            {!shrink() && <div class="chat-header-text">{type === 'baseline' ? "Normal" : "Experimental"}</div>}
        </div>
        <div ref={setChatInnerRef} onWheel={handleScroll} class={type === 'baseline' ? 'chat-baseline-inner' : 'chat-control-inner'}>
            {!shrink() && character().id in messages() && messages()[character().id].map(message => {
                return (
                    <div class="message">
                        {message.role === "error" ? (
                            <div>
                                <div class="message-role">AI</div>
                                <div class="error-content">{message.content}</div>
                            </div>
                        ) : (
                            <div>
                                <div class="message-role">{message.role == "assistant" ? character().name : "You"}</div>
                                {type === 'control' && message.role == 'assistant' ? traitsTag(message.traits): <div></div>}
                                <div ref={msgRef} class="message-content">{message.role === "user" 
                                ? message.content 
                                : constructMessage(message.tokens)}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
     </div>
    );
}

export default Chat;
